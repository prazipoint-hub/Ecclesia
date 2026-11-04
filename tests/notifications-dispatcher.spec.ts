import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { createMockPrisma } from './helpers/mockPrisma';

const mocked = vi.hoisted(() => ({ prisma: undefined as unknown }));

vi.mock('@/database', async () => {
  const { createMockPrisma: create } = await import('./helpers/mockPrisma');
  mocked.prisma = create();
  return { prisma: mocked.prisma, default: mocked.prisma };
});

import { NotificationDispatcher, type Message, type Recipient } from '@/services/notifications';
import { renderTemplate } from '@/services/notifications/render';

const prisma = mocked.prisma as ReturnType<typeof createMockPrisma>;

const member = (id: string, over: Partial<Recipient> = {}): Recipient => ({
  id, firstName: 'Ada', lastName: 'Moyo', email: `${id}@example.com`, phone: '0771234567', ...over,
});
const message = (over: Partial<Message> = {}): Message => ({
  churchId: 'church-1', churchName: 'Grace UMC', category: 'ANNOUNCEMENTS', type: 'BROADCAST',
  title: 'Hello {{firstName}}', body: 'Welcome to {{churchName}}', channels: ['IN_APP', 'EMAIL'], ...over,
});

const email = { send: vi.fn() };
const sms = { send: vi.fn() };
const dispatcher = () => new NotificationDispatcher(email, null);

const deliveries = () => prisma.notificationDelivery.createMany.mock.calls.flatMap((c) => c[0].data as Array<Record<string, unknown>>);
const inApp = () => prisma.notification.createMany.mock.calls.flatMap((c) => c[0].data as Array<Record<string, unknown>>);

beforeEach(() => {
  vi.resetAllMocks();
  prisma.notificationPreference.findMany.mockResolvedValue([]);
  prisma.notification.createMany.mockResolvedValue({ count: 0 });
  prisma.notificationDelivery.createMany.mockResolvedValue({ count: 0 });
  email.send.mockResolvedValue(undefined);
  sms.send.mockResolvedValue(undefined);
});

describe('renderTemplate', () => {
  test('fills known placeholders and blanks unknown ones', () => {
    expect(renderTemplate('Hi {{ firstName }} {{nope}}!', { firstName: 'Ada' })).toBe('Hi Ada !');
  });
});

describe('delivery', () => {
  test('sends in-app and email by default, personalised per member', async () => {
    const counts = await dispatcher().deliver([member('m1'), member('m2', { firstName: 'Tendai' })], message());
    expect(counts).toEqual({ delivered: 4, failed: 0, skipped: 0 });
    expect(inApp().map((n) => [n.recipientId, n.title, n.body])).toEqual([
      ['m1', 'Hello Ada', 'Welcome to Grace UMC'],
      ['m2', 'Hello Tendai', 'Welcome to Grace UMC'],
    ]);
    expect(email.send).toHaveBeenCalledTimes(2);
    expect(email.send.mock.calls[0][0]).toMatchObject({ to: 'm1@example.com', subject: 'Hello Ada' });
    expect(email.send.mock.calls[0][0].text).toContain('/my-account/notification-preferences');
    expect(deliveries().every((d) => d.status === 'SENT' && d.channel === 'EMAIL')).toBe(true);
  });

  test('escapes message content in the HTML email', async () => {
    await dispatcher().deliver([member('m1')], message({ body: '<script>alert(1)</script>', channels: ['EMAIL'] }));
    const html = email.send.mock.calls[0][0].html as string;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('a member who opted out of email is skipped and recorded', async () => {
    prisma.notificationPreference.findMany.mockResolvedValue([{ memberId: 'm1', channel: 'EMAIL', enabled: false }]);
    const counts = await dispatcher().deliver([member('m1')], message());
    expect(email.send).not.toHaveBeenCalled();
    expect(inApp()).toHaveLength(1);
    expect(counts).toEqual({ delivered: 1, failed: 0, skipped: 1 });
    expect(deliveries()).toEqual([expect.objectContaining({ memberId: 'm1', channel: 'EMAIL', status: 'SKIPPED', reason: 'Member opted out' })]);
  });

  test('preferences are looked up for this category only', async () => {
    await dispatcher().deliver([member('m1')], message({ category: 'GIVING' }));
    expect(prisma.notificationPreference.findMany.mock.calls[0][0].where).toEqual({ memberId: { in: ['m1'] }, category: 'GIVING' });
  });

  test('opting out of in-app creates no notification row', async () => {
    prisma.notificationPreference.findMany.mockResolvedValue([{ memberId: 'm1', channel: 'IN_APP', enabled: false }]);
    await dispatcher().deliver([member('m1')], message({ channels: ['IN_APP'] }));
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  test('a member without an email address is skipped', async () => {
    await dispatcher().deliver([member('m1', { email: null })], message({ channels: ['EMAIL'] }));
    expect(email.send).not.toHaveBeenCalled();
    expect(deliveries()[0]).toMatchObject({ status: 'SKIPPED', reason: 'No email address' });
  });

  test('one failing email does not stop the rest and is recorded as failed', async () => {
    email.send.mockRejectedValueOnce(new Error('smtp down 10.0.0.5')).mockResolvedValue(undefined);
    const counts = await dispatcher().deliver([member('m1'), member('m2')], message({ channels: ['EMAIL'] }));
    expect(counts).toEqual({ delivered: 1, failed: 1, skipped: 0 });
    const failed = deliveries().find((d) => d.status === 'FAILED')!;
    expect(failed.reason).toBe('Email could not be sent');
  });

  test('large audiences are processed in batches of 200', async () => {
    const many = Array.from({ length: 450 }, (_, i) => member(`m${i}`));
    await dispatcher().deliver(many, message({ channels: ['IN_APP'] }));
    expect(prisma.notificationPreference.findMany).toHaveBeenCalledTimes(3);
    expect(inApp()).toHaveLength(450);
  });
});

describe('SMS', () => {
  const smsOn = [{ memberId: 'm1', channel: 'SMS', enabled: true }];

  test('without a provider SMS is recorded as skipped', async () => {
    prisma.notificationPreference.findMany.mockResolvedValue(smsOn);
    await dispatcher().deliver([member('m1')], message({ channels: ['SMS'] }));
    expect(deliveries()[0]).toMatchObject({ channel: 'SMS', status: 'SKIPPED', reason: 'SMS provider not configured' });
  });

  test('SMS is off by default even when a provider exists', async () => {
    await new NotificationDispatcher(email, sms).deliver([member('m1')], message({ channels: ['SMS'] }));
    expect(sms.send).not.toHaveBeenCalled();
    expect(deliveries()[0]).toMatchObject({ status: 'SKIPPED', reason: 'Member opted out' });
  });

  test('opted-in members with a phone number are sent the text', async () => {
    prisma.notificationPreference.findMany.mockResolvedValue(smsOn);
    await new NotificationDispatcher(email, sms).deliver([member('m1')], message({ channels: ['SMS'] }));
    expect(sms.send).toHaveBeenCalledWith('0771234567', 'Hello Ada: Welcome to Grace UMC');
    expect(deliveries()[0]).toMatchObject({ status: 'SENT' });
  });

  test('opted-in members without a phone number are skipped', async () => {
    prisma.notificationPreference.findMany.mockResolvedValue(smsOn);
    await new NotificationDispatcher(email, sms).deliver([member('m1', { phone: null })], message({ channels: ['SMS'] }));
    expect(sms.send).not.toHaveBeenCalled();
    expect(deliveries()[0]).toMatchObject({ status: 'SKIPPED', reason: 'No phone number' });
  });
});

describe('notify', () => {
  const one = { churchId: 'church-1', category: 'GIVING' as const, type: 'PAYMENT_RECEIVED', title: 'Thanks', body: 'Gift received', channels: ['IN_APP' as const] };

  test('looks the member up within the church', async () => {
    prisma.member.findFirst.mockResolvedValue({ id: 'm1', firstName: 'Ada', lastName: 'Moyo', email: null, phone: null });
    prisma.church.findUnique.mockResolvedValue({ name: 'Grace UMC' });
    await dispatcher().notify('m1', one);
    expect(prisma.member.findFirst.mock.calls[0][0].where).toEqual({ id: 'm1', churchId: 'church-1' });
    expect(inApp()).toHaveLength(1);
  });

  test('a member from another church receives nothing', async () => {
    prisma.member.findFirst.mockResolvedValue(null);
    await dispatcher().notify('m1', one);
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  test('never throws, even when the database fails', async () => {
    prisma.member.findFirst.mockRejectedValue(new Error('db down'));
    prisma.church.findUnique.mockResolvedValue(null);
    await expect(dispatcher().notify('m1', one)).resolves.toBeUndefined();
  });
});
