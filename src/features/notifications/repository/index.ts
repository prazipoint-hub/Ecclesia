import { Prisma } from '@prisma/client';
import { prisma } from '@/database';
import type { Audience } from '../types';

export class NotificationRepository {
  // Preferences
  listPreferences(memberId: string) {
    return prisma.notificationPreference.findMany({ where: { memberId } });
  }

  savePreferences(memberId: string, items: { category: string; channel: string; enabled: boolean }[]) {
    return prisma.$transaction(
      items.map((i) =>
        prisma.notificationPreference.upsert({
          where: { memberId_channel_category: { memberId, channel: i.channel, category: i.category } },
          update: { enabled: i.enabled },
          create: { memberId, channel: i.channel, category: i.category, enabled: i.enabled },
        })
      )
    );
  }

  // Push subscriptions
  savePushSubscription(memberId: string, endpoint: string, p256dh: string, authKey: string, userAgent?: string) {
    return prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { memberId, p256dh, authKey, userAgent: userAgent ?? null },
      create: { memberId, endpoint, p256dh, authKey, userAgent: userAgent ?? null },
    });
  }

  removePushSubscription(memberId: string, endpoint: string) {
    return prisma.pushSubscription.deleteMany({ where: { memberId, endpoint } });
  }

  // Templates
  listTemplates(churchId: string) {
    return prisma.communicationTemplate.findMany({ where: { churchId }, orderBy: { name: 'asc' } });
  }

  findTemplate(id: string) {
    return prisma.communicationTemplate.findUnique({ where: { id } });
  }

  createTemplate(data: Prisma.CommunicationTemplateUncheckedCreateInput) {
    return prisma.communicationTemplate.create({ data });
  }

  updateTemplate(id: string, data: Prisma.CommunicationTemplateUncheckedUpdateInput) {
    return prisma.communicationTemplate.update({ where: { id }, data });
  }

  deleteTemplate(id: string) {
    return prisma.communicationTemplate.delete({ where: { id } });
  }

  // Audience
  countOwned(churchId: string, audience: Extract<Audience, { ids: string[] }>) {
    const where = { id: { in: audience.ids }, churchId };
    return audience.type === 'SECTIONS' ? prisma.section.count({ where }) : prisma.organization.count({ where });
  }

  audienceWhere(churchId: string, audience: Audience): Prisma.MemberWhereInput {
    const base: Prisma.MemberWhereInput = { churchId, membershipStatus: 'ACTIVE' };
    if (audience.type === 'SECTIONS') return { ...base, sectionId: { in: audience.ids } };
    if (audience.type === 'ORGANIZATIONS') {
      return { ...base, organizationMemberships: { some: { organizationId: { in: audience.ids }, membershipStatus: 'ACTIVE' } } };
    }
    return base;
  }

  countAudience(churchId: string, audience: Audience) {
    return prisma.member.count({ where: this.audienceWhere(churchId, audience) });
  }

  /** Cursor-paged so a large church is never loaded into memory at once. */
  listAudienceBatch(churchId: string, audience: Audience, afterId: string | null, take: number) {
    return prisma.member.findMany({
      where: this.audienceWhere(churchId, audience),
      select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      orderBy: { id: 'asc' },
      take,
      ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
    });
  }

  // Broadcasts
  createBroadcast(data: Prisma.BroadcastMessageUncheckedCreateInput) {
    return prisma.broadcastMessage.create({ data });
  }

  findBroadcast(id: string) {
    return prisma.broadcastMessage.findUnique({ where: { id } });
  }

  updateBroadcast(id: string, data: Prisma.BroadcastMessageUncheckedUpdateInput) {
    return prisma.broadcastMessage.update({ where: { id }, data });
  }

  /** Atomically moves a broadcast between states; false when someone else got there first. */
  async transition(id: string, churchId: string, from: string[], data: Prisma.BroadcastMessageUncheckedUpdateInput): Promise<boolean> {
    const result = await prisma.broadcastMessage.updateMany({ where: { id, churchId, status: { in: from } }, data });
    return result.count === 1;
  }

  async listBroadcasts(where: Prisma.BroadcastMessageWhereInput, skip: number, take: number) {
    return Promise.all([
      prisma.broadcastMessage.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      prisma.broadcastMessage.count({ where }),
    ]);
  }

  listDueBroadcasts(now: Date, churchId?: string) {
    return prisma.broadcastMessage.findMany({ where: { status: 'SCHEDULED', scheduledAt: { lte: now }, ...(churchId ? { churchId } : {}) }, take: 50 });
  }

  findChurchName(churchId: string) {
    return prisma.church.findUnique({ where: { id: churchId }, select: { name: true } });
  }
}

export const notificationRepository = new NotificationRepository();
