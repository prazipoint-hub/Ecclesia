import { Prisma } from '@prisma/client';
import { logger } from '@/config/logger';
import {
  CATEGORIES,
  CHANNELS,
  DEFAULT_ENABLED,
  notificationDispatcher,
  type Channel,
  type NotificationDispatcher,
} from '@/services/notifications';
import { TEMPLATE_VARIABLES } from '@/services/notifications/render';
import type { AuthorizedUser } from '@/types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/types/errors';
import { notificationRepository as repository } from '../repository';
import type { Audience, BroadcastInput, ListQuery, TemplateInput, UpdateBroadcastInput, UpdateTemplateInput } from '../types';

type BroadcastRow = NonNullable<Awaited<ReturnType<typeof repository.findBroadcast>>>;

const BATCH = 500;

function require(user: AuthorizedUser, permission: string): void {
  if (!user.permissions.includes(permission)) throw new ForbiddenError(`Forbidden: ${permission} permission required`);
}

export class NotificationService {
  constructor(private readonly dispatcher: NotificationDispatcher = notificationDispatcher) {}

  private requireMemberId(user: AuthorizedUser): string {
    if (!user.memberId) throw new ForbiddenError('Forbidden: your account is not linked to a member profile');
    return user.memberId;
  }

  // ------------------------------------------------------------ preferences

  async getPreferences(user: AuthorizedUser) {
    const stored = await repository.listPreferences(this.requireMemberId(user));
    const chosen = new Map(stored.map((p) => [`${p.category}:${p.channel}`, p.enabled]));
    return {
      categories: CATEGORIES.map((category) => ({
        category,
        channels: CHANNELS.map((channel) => ({
          channel,
          enabled: chosen.get(`${category}:${channel}`) ?? DEFAULT_ENABLED[channel],
          isDefault: !chosen.has(`${category}:${channel}`),
          // Push can be switched on now so it works the day delivery is added; SMS only when a provider exists.
          available: channel === 'SMS' ? this.dispatcher.smsAvailable : channel !== 'PUSH',
        })),
      })),
    };
  }

  async updatePreferences(user: AuthorizedUser, items: { category: string; channel: string; enabled: boolean }[]) {
    await repository.savePreferences(this.requireMemberId(user), items);
    return this.getPreferences(user);
  }

  async subscribePush(user: AuthorizedUser, input: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent?: string) {
    await repository.savePushSubscription(this.requireMemberId(user), input.endpoint, input.keys.p256dh, input.keys.auth, userAgent?.slice(0, 255));
  }

  async unsubscribePush(user: AuthorizedUser, endpoint: string) {
    await repository.removePushSubscription(this.requireMemberId(user), endpoint);
  }

  // -------------------------------------------------------------- templates

  async listTemplates(user: AuthorizedUser) {
    require(user, 'notification:template:manage');
    return { variables: [...TEMPLATE_VARIABLES], items: await repository.listTemplates(user.churchId) };
  }

  async createTemplate(user: AuthorizedUser, input: TemplateInput) {
    require(user, 'notification:template:manage');
    try {
      return await repository.createTemplate({ churchId: user.churchId, ...input });
    } catch (error) {
      throw this.duplicateName(error);
    }
  }

  async updateTemplate(user: AuthorizedUser, id: string, input: UpdateTemplateInput) {
    require(user, 'notification:template:manage');
    await this.ownedTemplate(user, id);
    try {
      return await repository.updateTemplate(id, input);
    } catch (error) {
      throw this.duplicateName(error);
    }
  }

  async deleteTemplate(user: AuthorizedUser, id: string) {
    require(user, 'notification:template:manage');
    await this.ownedTemplate(user, id);
    await repository.deleteTemplate(id);
  }

  private async ownedTemplate(user: AuthorizedUser, id: string) {
    const template = await repository.findTemplate(id);
    if (!template || template.churchId !== user.churchId) throw new NotFoundError('Template');
    return template;
  }

  private duplicateName(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return new ConflictError('A template with that name already exists');
    return error;
  }

  // -------------------------------------------------------------- broadcasts

  async previewAudience(user: AuthorizedUser, audience: Audience) {
    require(user, 'notification:broadcast:create');
    await this.assertAudienceOwned(user.churchId, audience);
    return { recipients: await repository.countAudience(user.churchId, audience) };
  }

  async createBroadcast(user: AuthorizedUser, input: BroadcastInput) {
    require(user, 'notification:broadcast:create');
    await this.validateContent(user.churchId, input);
    const created = await repository.createBroadcast({
      churchId: user.churchId,
      senderId: user.id,
      title: input.title,
      body: input.body,
      category: input.category,
      audience: JSON.stringify(input.audience),
      channels: input.channels.join(','),
    });
    return this.view(created);
  }

  async updateBroadcast(user: AuthorizedUser, id: string, input: UpdateBroadcastInput) {
    require(user, 'notification:broadcast:create');
    const existing = await this.owned(user, id);
    if (existing.status !== 'DRAFT') throw new ConflictError('Only drafts can be edited');
    const merged = { ...this.view(existing), ...input } as BroadcastInput;
    await this.validateContent(user.churchId, merged);
    const updated = await repository.updateBroadcast(id, {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.body !== undefined && { body: input.body }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.audience !== undefined && { audience: JSON.stringify(input.audience) }),
      ...(input.channels !== undefined && { channels: input.channels.join(',') }),
    });
    return this.view(updated);
  }

  async listBroadcasts(user: AuthorizedUser, query: ListQuery) {
    require(user, 'notification:broadcast:create');
    const [rows, total] = await repository.listBroadcasts(
      { churchId: user.churchId, ...(query.status ? { status: query.status } : {}) },
      (query.page - 1) * query.pageSize,
      query.pageSize
    );
    return { items: rows.map((r) => this.view(r)), total, page: query.page, pageSize: query.pageSize };
  }

  async getBroadcast(user: AuthorizedUser, id: string) {
    require(user, 'notification:broadcast:create');
    return this.view(await this.owned(user, id));
  }

  /** Starts delivery in the background and returns straight away; progress is read from the broadcast. */
  async sendBroadcast(user: AuthorizedUser, id: string) {
    require(user, 'notification:broadcast:send');
    const broadcast = await this.owned(user, id);
    if (!(await repository.transition(id, user.churchId, ['DRAFT', 'SCHEDULED'], { status: 'SENDING' }))) {
      throw new ConflictError(`Broadcast is ${broadcast.status.toLowerCase()} and cannot be sent`);
    }
    void this.deliver({ ...broadcast, status: 'SENDING' }).catch((error) => logger.error({ err: error, broadcastId: id }, 'Broadcast delivery crashed'));
    return this.view({ ...broadcast, status: 'SENDING' });
  }

  async scheduleBroadcast(user: AuthorizedUser, id: string, scheduledAt: Date) {
    require(user, 'notification:broadcast:send');
    const broadcast = await this.owned(user, id);
    if (!(await repository.transition(id, user.churchId, ['DRAFT', 'SCHEDULED'], { status: 'SCHEDULED', scheduledAt }))) {
      throw new ConflictError(`Broadcast is ${broadcast.status.toLowerCase()} and cannot be scheduled`);
    }
    return this.view({ ...broadcast, status: 'SCHEDULED', scheduledAt });
  }

  async cancelBroadcast(user: AuthorizedUser, id: string) {
    require(user, 'notification:broadcast:send');
    const broadcast = await this.owned(user, id);
    if (!(await repository.transition(id, user.churchId, ['DRAFT', 'SCHEDULED'], { status: 'CANCELLED' }))) {
      throw new ConflictError(`Broadcast is ${broadcast.status.toLowerCase()} and cannot be cancelled`);
    }
    return this.view({ ...broadcast, status: 'CANCELLED' });
  }

  /** Sends every scheduled broadcast that has come due. Run by an admin, a cron job, or the optional in-process timer. */
  async runDue(churchId?: string, now = new Date()) {
    const due = await repository.listDueBroadcasts(now, churchId);
    let sent = 0;
    for (const broadcast of due) {
      if (!(await repository.transition(broadcast.id, broadcast.churchId, ['SCHEDULED'], { status: 'SENDING' }))) continue;
      await this.deliver({ ...broadcast, status: 'SENDING' }).catch((error) => logger.error({ err: error, broadcastId: broadcast.id }, 'Scheduled broadcast crashed'));
      sent += 1;
    }
    return { due: due.length, sent };
  }

  async runDueForUser(user: AuthorizedUser) {
    require(user, 'notification:broadcast:send');
    return this.runDue(user.churchId);
  }

  /** Delivers a broadcast that has already been claimed (status SENDING). */
  async deliver(broadcast: BroadcastRow): Promise<void> {
    const audience = JSON.parse(broadcast.audience) as Audience;
    const channels = broadcast.channels.split(',') as Channel[];
    const church = await repository.findChurchName(broadcast.churchId);
    const totals = { recipients: 0, delivered: 0, failed: 0, skipped: 0 };
    try {
      let cursor: string | null = null;
      for (;;) {
        const batch = await repository.listAudienceBatch(broadcast.churchId, audience, cursor, BATCH);
        if (batch.length === 0) break;
        const counts = await this.dispatcher.deliver(batch, {
          churchId: broadcast.churchId,
          churchName: church?.name ?? 'Your church',
          category: broadcast.category as never,
          type: 'BROADCAST',
          title: broadcast.title,
          body: broadcast.body,
          channels,
          broadcastId: broadcast.id,
          entityType: 'BROADCAST',
          entityId: broadcast.id,
        });
        totals.recipients += batch.length;
        totals.delivered += counts.delivered;
        totals.failed += counts.failed;
        totals.skipped += counts.skipped;
        cursor = batch[batch.length - 1].id;
        if (batch.length < BATCH) break;
      }
      await repository.updateBroadcast(broadcast.id, {
        status: 'SENT', sentAt: new Date(), recipientCount: totals.recipients, deliveredCount: totals.delivered, failedCount: totals.failed, skippedCount: totals.skipped,
      });
    } catch (error) {
      await repository.updateBroadcast(broadcast.id, {
        status: 'FAILED', recipientCount: totals.recipients, deliveredCount: totals.delivered, failedCount: totals.failed, skippedCount: totals.skipped,
      });
      throw error;
    }
  }

  private async validateContent(churchId: string, input: Pick<BroadcastInput, 'channels' | 'audience'>) {
    if (input.channels.includes('SMS') && !this.dispatcher.smsAvailable) throw new ValidationError('SMS is not available: no SMS provider is configured');
    await this.assertAudienceOwned(churchId, input.audience);
  }

  private async assertAudienceOwned(churchId: string, audience: Audience) {
    if (audience.type === 'ALL') return;
    const unique = [...new Set(audience.ids)];
    if ((await repository.countOwned(churchId, { ...audience, ids: unique })) !== unique.length) {
      throw new ValidationError(`One or more selected ${audience.type === 'SECTIONS' ? 'sections' : 'organizations'} do not exist`);
    }
  }

  private async owned(user: AuthorizedUser, id: string): Promise<BroadcastRow> {
    const broadcast = await repository.findBroadcast(id);
    if (!broadcast || broadcast.churchId !== user.churchId) throw new NotFoundError('Broadcast');
    return broadcast;
  }

  private view(b: BroadcastRow) {
    return {
      id: b.id,
      title: b.title,
      body: b.body,
      category: b.category,
      audience: JSON.parse(b.audience) as Audience,
      channels: b.channels.split(',') as Array<'IN_APP' | 'EMAIL' | 'SMS'>,
      status: b.status,
      scheduledAt: b.scheduledAt,
      sentAt: b.sentAt,
      recipientCount: b.recipientCount,
      deliveredCount: b.deliveredCount,
      failedCount: b.failedCount,
      skippedCount: b.skippedCount,
      createdAt: b.createdAt,
    };
  }
}

export const notificationService = new NotificationService();
