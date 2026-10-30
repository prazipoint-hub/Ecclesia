import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/database';
import { logger } from '@/config/logger';
import { emailService as defaultEmailService, type EmailService } from '@/services/email';
import { messageEmail, renderTemplate } from './render';
import { createSmsProvider, type SmsProvider } from './sms';

export const CATEGORIES = ['GIVING', 'EVENTS', 'ANNOUNCEMENTS', 'PASTORAL'] as const;
export const CHANNELS = ['IN_APP', 'EMAIL', 'SMS', 'PUSH'] as const;
export type Category = (typeof CATEGORIES)[number];
export type Channel = (typeof CHANNELS)[number];

/** What a member gets before they choose: free channels on, anything that costs money or needs a device off. */
export const DEFAULT_ENABLED: Record<Channel, boolean> = { IN_APP: true, EMAIL: true, SMS: false, PUSH: false };

export type Recipient = { id: string; firstName: string; lastName: string; email: string | null; phone: string | null };

export type Message = {
  churchId: string;
  churchName: string;
  category: Category;
  type: string;
  title: string;
  body: string;
  channels: Channel[];
  broadcastId?: string;
  entityType?: string;
  entityId?: string;
};

export type DeliveryCounts = { delivered: number; failed: number; skipped: number };

const chunk = <T>(items: T[], size: number): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

export class NotificationDispatcher {
  constructor(
    private readonly email: EmailService = defaultEmailService,
    private readonly sms: SmsProvider | null = createSmsProvider()
  ) {}

  get smsAvailable(): boolean {
    return this.sms !== null;
  }

  /** Sends one message to one member. Never throws: a failed notification must not fail the action that caused it. */
  async notify(memberId: string, message: Omit<Message, 'churchName' | 'churchId'> & { churchId: string }): Promise<void> {
    try {
      const [member, church] = await Promise.all([
        prisma.member.findFirst({ where: { id: memberId, churchId: message.churchId }, select: { id: true, firstName: true, lastName: true, email: true, phone: true } }),
        prisma.church.findUnique({ where: { id: message.churchId }, select: { name: true } }),
      ]);
      if (!member) return;
      await this.deliver([member], { ...message, churchName: church?.name ?? 'Your church' });
    } catch (error) {
      logger.error({ err: error, memberId, type: message.type }, 'Failed to send notification');
    }
  }

  /** Delivers one message to many members, honouring each member's preferences per channel. */
  async deliver(recipients: Recipient[], message: Message): Promise<DeliveryCounts> {
    const counts: DeliveryCounts = { delivered: 0, failed: 0, skipped: 0 };
    for (const batch of chunk(recipients, 200)) {
      const part = await this.deliverBatch(batch, message);
      counts.delivered += part.delivered;
      counts.failed += part.failed;
      counts.skipped += part.skipped;
    }
    return counts;
  }

  private async deliverBatch(recipients: Recipient[], message: Message): Promise<DeliveryCounts> {
    const counts: DeliveryCounts = { delivered: 0, failed: 0, skipped: 0 };
    const prefs = (await prisma.notificationPreference.findMany({
      where: { memberId: { in: recipients.map((r) => r.id) }, category: message.category },
      select: { memberId: true, channel: true, enabled: true },
    })) ?? [];
    const chosen = new Map(prefs.map((p) => [`${p.memberId}:${p.channel}`, p.enabled]));
    const wants = (memberId: string, channel: Channel) => chosen.get(`${memberId}:${channel}`) ?? DEFAULT_ENABLED[channel];

    const inApp: Prisma.NotificationCreateManyInput[] = [];
    const deliveries: Prisma.NotificationDeliveryCreateManyInput[] = [];
    const record = (memberId: string, channel: Channel, status: 'SENT' | 'FAILED' | 'SKIPPED', reason: string | null = null) => {
      deliveries.push({ id: randomUUID(), churchId: message.churchId, broadcastId: message.broadcastId ?? null, memberId, channel, category: message.category, status, reason });
      if (status === 'SENT') counts.delivered += 1;
      else if (status === 'FAILED') counts.failed += 1;
      else counts.skipped += 1;
    };

    const external: Array<() => Promise<void>> = [];
    for (const member of recipients) {
      const vars = { firstName: member.firstName, lastName: member.lastName, churchName: message.churchName };
      const title = renderTemplate(message.title, vars);
      const body = renderTemplate(message.body, vars);

      for (const channel of message.channels) {
        if (!wants(member.id, channel)) {
          if (channel === 'IN_APP') counts.skipped += 1;
          else record(member.id, channel, 'SKIPPED', 'Member opted out');
          continue;
        }
        if (channel === 'IN_APP') {
          inApp.push({
            id: randomUUID(), recipientId: member.id, type: message.type, title, body, category: message.category,
            entityType: message.entityType ?? null, entityId: message.entityId ?? null, broadcastId: message.broadcastId ?? null,
          });
          counts.delivered += 1;
        } else if (channel === 'EMAIL') {
          if (!member.email) { record(member.id, channel, 'SKIPPED', 'No email address'); continue; }
          const to = member.email;
          external.push(async () => {
            try {
              await this.email.send(messageEmail(to, title, body, message.churchName));
              record(member.id, channel, 'SENT');
            } catch (error) {
              logger.error({ err: error, memberId: member.id }, 'Email delivery failed');
              record(member.id, channel, 'FAILED', 'Email could not be sent');
            }
          });
        } else if (channel === 'SMS') {
          if (!this.sms) { record(member.id, channel, 'SKIPPED', 'SMS provider not configured'); continue; }
          if (!member.phone) { record(member.id, channel, 'SKIPPED', 'No phone number'); continue; }
          const sms = this.sms;
          const to = member.phone;
          external.push(async () => {
            try {
              await sms.send(to, `${title}: ${body}`.slice(0, 480));
              record(member.id, channel, 'SENT');
            } catch (error) {
              logger.error({ err: error, memberId: member.id }, 'SMS delivery failed');
              record(member.id, channel, 'FAILED', 'SMS could not be sent');
            }
          });
        } else {
          record(member.id, channel, 'SKIPPED', 'Push delivery is not enabled');
        }
      }
    }

    for (const group of chunk(external, 5)) await Promise.all(group.map((send) => send()));
    if (inApp.length > 0) await prisma.notification.createMany({ data: inApp });
    if (deliveries.length > 0) await prisma.notificationDelivery.createMany({ data: deliveries });
    return counts;
  }
}

export const notificationDispatcher = new NotificationDispatcher();
