import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { createMockPrisma } from './helpers/mockPrisma';

const mocked = vi.hoisted(() => ({ prisma: undefined as unknown }));

vi.mock('@/database', async () => {
  const { createMockPrisma: create } = await import('./helpers/mockPrisma');
  mocked.prisma = create();
  return { prisma: mocked.prisma, default: mocked.prisma };
});

import { createApp } from '@/app';
import { jwtSecret } from '@/config/secrets';

const prisma = mocked.prisma as ReturnType<typeof createMockPrisma>;
const app = createApp();

const token = (opts: { memberId?: string | null; permissions?: string[] } = {}) =>
  jwt.sign(
    { sub: 'user-1', email: 'a@example.com', churchId: 'church-1', memberId: opts.memberId === undefined ? 'member-1' : opts.memberId, permissions: opts.permissions ?? [], sessionId: 's1', tokenId: 't1' },
    jwtSecret,
    { expiresIn: '5m' }
  );
const auth = (opts?: Parameters<typeof token>[0]) => ({ Authorization: `Bearer ${token(opts)}` });
const admin = (...permissions: string[]) => auth({ permissions });

beforeEach(() => {
  vi.resetAllMocks();
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.$transaction.mockImplementation((async (arg: unknown) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg as unknown[]))) as never);
});

describe('preferences', () => {
  test('requires sign-in and a linked member', async () => {
    expect((await request(app).get('/api/v2/notifications/preferences')).status).toBe(401);
    expect((await request(app).get('/api/v2/notifications/preferences').set(auth({ memberId: null }))).status).toBe(403);
  });

  test('returns every category and channel with defaults and availability', async () => {
    prisma.notificationPreference.findMany.mockResolvedValue([{ category: 'EVENTS', channel: 'EMAIL', enabled: false }]);
    const res = await request(app).get('/api/v2/notifications/preferences').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.categories.map((c: { category: string }) => c.category)).toEqual(['GIVING', 'EVENTS', 'ANNOUNCEMENTS', 'PASTORAL']);
    const events = res.body.categories.find((c: { category: string }) => c.category === 'EVENTS');
    const byChannel = Object.fromEntries(events.channels.map((c: { channel: string }) => [c.channel, c]));
    expect(byChannel.EMAIL).toMatchObject({ enabled: false, isDefault: false, available: true });
    expect(byChannel.IN_APP).toMatchObject({ enabled: true, isDefault: true });
    expect(byChannel.SMS).toMatchObject({ enabled: false, available: false });
    expect(byChannel.PUSH).toMatchObject({ enabled: false, available: false });
    expect(prisma.notificationPreference.findMany.mock.calls[0][0].where).toEqual({ memberId: 'member-1' });
  });

  test('saves only for the caller and validates input', async () => {
    prisma.notificationPreference.findMany.mockResolvedValue([]);
    prisma.notificationPreference.upsert.mockResolvedValue({});
    const ok = await request(app).put('/api/v2/notifications/preferences').set(auth()).send({ preferences: [{ category: 'GIVING', channel: 'EMAIL', enabled: false }] });
    expect(ok.status).toBe(200);
    expect(prisma.notificationPreference.upsert.mock.calls[0][0]).toMatchObject({
      where: { memberId_channel_category: { memberId: 'member-1', channel: 'EMAIL', category: 'GIVING' } },
      update: { enabled: false },
    });
    for (const bad of [
      { preferences: [{ category: 'SPAM', channel: 'EMAIL', enabled: true }] },
      { preferences: [{ category: 'GIVING', channel: 'FAX', enabled: true }] },
      { preferences: [] },
      { preferences: [{ category: 'GIVING', channel: 'EMAIL', enabled: true, memberId: 'member-2' }] },
    ]) {
      expect((await request(app).put('/api/v2/notifications/preferences').set(auth()).send(bad)).status).toBe(400);
    }
  });

  test('push subscriptions must be https and are removed only for their owner', async () => {
    const keys = { p256dh: 'k1', auth: 'k2' };
    expect((await request(app).post('/api/v2/notifications/push-subscriptions').set(auth()).send({ endpoint: 'http://push.test/x', keys })).status).toBe(400);
    prisma.pushSubscription.upsert.mockResolvedValue({});
    expect((await request(app).post('/api/v2/notifications/push-subscriptions').set(auth()).send({ endpoint: 'https://push.test/x', keys })).status).toBe(204);
    expect(prisma.pushSubscription.upsert.mock.calls[0][0].create).toMatchObject({ memberId: 'member-1', endpoint: 'https://push.test/x' });
    prisma.pushSubscription.deleteMany.mockResolvedValue({ count: 1 });
    await request(app).delete('/api/v2/notifications/push-subscriptions').set(auth()).send({ endpoint: 'https://push.test/x' });
    expect(prisma.pushSubscription.deleteMany.mock.calls[0][0].where).toEqual({ memberId: 'member-1', endpoint: 'https://push.test/x' });
  });
});

describe('templates', () => {
  const tpl = { id: 't1', churchId: 'church-1', name: 'Welcome', subject: 'Hi {{firstName}}', body: 'Hello', createdAt: new Date(), updatedAt: new Date() };

  test('need the template permission', async () => {
    expect((await request(app).get('/api/v2/notifications/templates').set(auth())).status).toBe(403);
    expect((await request(app).post('/api/v2/notifications/templates').set(admin('notification:broadcast:create')).send({})).status).toBe(403);
  });

  test('list is scoped to the church and advertises the variables', async () => {
    prisma.communicationTemplate.findMany.mockResolvedValue([tpl]);
    const res = await request(app).get('/api/v2/notifications/templates').set(admin('notification:template:manage'));
    expect(res.body.variables).toEqual(['firstName', 'lastName', 'churchName']);
    expect(prisma.communicationTemplate.findMany.mock.calls[0][0].where).toEqual({ churchId: 'church-1' });
  });

  test('create validates, stamps the church and maps duplicates to 409', async () => {
    const as = admin('notification:template:manage');
    expect((await request(app).post('/api/v2/notifications/templates').set(as).send({ name: '', subject: 's', body: 'b' })).status).toBe(400);
    prisma.communicationTemplate.create.mockResolvedValue(tpl);
    expect((await request(app).post('/api/v2/notifications/templates').set(as).send({ name: 'Welcome', subject: 's', body: 'b' })).status).toBe(201);
    expect(prisma.communicationTemplate.create.mock.calls[0][0].data.churchId).toBe('church-1');
    prisma.communicationTemplate.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    expect((await request(app).post('/api/v2/notifications/templates').set(as).send({ name: 'Welcome', subject: 's', body: 'b' })).status).toBe(409);
  });

  test("another church's template cannot be edited or deleted", async () => {
    const as = admin('notification:template:manage');
    prisma.communicationTemplate.findUnique.mockResolvedValue({ ...tpl, churchId: 'church-2' });
    expect((await request(app).put('/api/v2/notifications/templates/t1').set(as).send({ name: 'x' })).status).toBe(404);
    expect((await request(app).delete('/api/v2/notifications/templates/t1').set(as)).status).toBe(404);
    expect(prisma.communicationTemplate.update).not.toHaveBeenCalled();
    expect(prisma.communicationTemplate.delete).not.toHaveBeenCalled();
  });
});

describe('broadcasts', () => {
  const draft = (over: Record<string, unknown> = {}) => ({
    id: 'b1', churchId: 'church-1', senderId: 'user-1', title: 'Service moved', body: 'We meet at 9', category: 'ANNOUNCEMENTS',
    audience: JSON.stringify({ type: 'ALL' }), channels: 'IN_APP,EMAIL', status: 'DRAFT', scheduledAt: null, sentAt: null,
    recipientCount: 0, deliveredCount: 0, failedCount: 0, skippedCount: 0, createdAt: new Date(), updatedAt: new Date(), ...over,
  });
  const create = admin('notification:broadcast:create');
  const send = admin('notification:broadcast:create', 'notification:broadcast:send');
  const input = { title: 'Service moved', body: 'We meet at 9', audience: { type: 'ALL' }, channels: ['IN_APP', 'EMAIL'] };

  test('permissions: creating needs create, sending/scheduling/cancelling needs send', async () => {
    expect((await request(app).post('/api/v2/notifications/broadcasts').set(auth()).send(input)).status).toBe(403);
    for (const path of ['send', 'schedule', 'cancel']) {
      expect((await request(app).post(`/api/v2/notifications/broadcasts/b1/${path}`).set(create).send({})).status).toBe(403);
    }
    expect((await request(app).post('/api/v2/notifications/broadcasts/run-due').set(create)).status).toBe(403);
  });

  test.each([
    ['empty title', { title: '' }],
    ['no channels', { channels: [] }],
    ['unknown channel', { channels: ['PUSH'] }],
    ['unknown audience', { audience: { type: 'EVERYONE' } }],
    ['empty section list', { audience: { type: 'SECTIONS', ids: [] } }],
    ['extra field', { status: 'SENT' }],
  ])('rejects %s', async (_n, patch) => {
    expect((await request(app).post('/api/v2/notifications/broadcasts').set(create).send({ ...input, ...patch })).status).toBe(400);
    expect(prisma.broadcastMessage.create).not.toHaveBeenCalled();
  });

  test('SMS is refused while no provider is configured', async () => {
    const res = await request(app).post('/api/v2/notifications/broadcasts').set(create).send({ ...input, channels: ['SMS'] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/SMS/);
  });

  test('sections from another church are rejected', async () => {
    prisma.section.count.mockResolvedValue(1);
    const res = await request(app).post('/api/v2/notifications/broadcasts').set(create).send({ ...input, audience: { type: 'SECTIONS', ids: ['s1', 's2'] } });
    expect(res.status).toBe(400);
    expect(prisma.section.count.mock.calls[0][0].where).toEqual({ id: { in: ['s1', 's2'] }, churchId: 'church-1' });
  });

  test('creates a draft owned by the church and sender', async () => {
    prisma.broadcastMessage.create.mockResolvedValue(draft());
    const res = await request(app).post('/api/v2/notifications/broadcasts').set(create).send(input);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'DRAFT', audience: { type: 'ALL' }, channels: ['IN_APP', 'EMAIL'] });
    expect(prisma.broadcastMessage.create.mock.calls[0][0].data).toMatchObject({ churchId: 'church-1', senderId: 'user-1', channels: 'IN_APP,EMAIL', category: 'ANNOUNCEMENTS' });
  });

  test('only drafts can be edited', async () => {
    prisma.broadcastMessage.findUnique.mockResolvedValue(draft({ status: 'SENT' }));
    expect((await request(app).put('/api/v2/notifications/broadcasts/b1').set(create).send({ title: 'New' })).status).toBe(409);
    expect(prisma.broadcastMessage.update).not.toHaveBeenCalled();
  });

  test("another church's broadcast is 404", async () => {
    prisma.broadcastMessage.findUnique.mockResolvedValue(draft({ churchId: 'church-2' }));
    expect((await request(app).get('/api/v2/notifications/broadcasts/b1').set(create)).status).toBe(404);
    expect((await request(app).post('/api/v2/notifications/broadcasts/b1/send').set(send)).status).toBe(404);
  });

  test('audience preview counts active members of the chosen sections', async () => {
    prisma.section.count.mockResolvedValue(1);
    prisma.member.count.mockResolvedValue(42);
    const res = await request(app).post('/api/v2/notifications/broadcasts/audience-preview').set(create).send({ audience: { type: 'SECTIONS', ids: ['s1'] } });
    expect(res.body).toEqual({ recipients: 42 });
    expect(prisma.member.count.mock.calls[0][0].where).toEqual({ churchId: 'church-1', membershipStatus: 'ACTIVE', sectionId: { in: ['s1'] } });
  });

  test('sending claims the broadcast atomically, answers 202 and delivers in the background', async () => {
    prisma.broadcastMessage.findUnique.mockResolvedValue(draft());
    prisma.broadcastMessage.updateMany.mockResolvedValue({ count: 1 });
    prisma.church.findUnique.mockResolvedValue({ name: 'Grace UMC' });
    prisma.member.findMany.mockResolvedValue([
      { id: 'm1', firstName: 'Ada', lastName: 'Moyo', email: 'ada@example.com', phone: null },
      { id: 'm2', firstName: 'Tendai', lastName: 'Dube', email: null, phone: null },
    ]);
    prisma.notificationPreference.findMany.mockResolvedValue([]);
    prisma.notification.createMany.mockResolvedValue({ count: 2 });
    prisma.notificationDelivery.createMany.mockResolvedValue({ count: 2 });
    prisma.broadcastMessage.update.mockResolvedValue({});

    const res = await request(app).post('/api/v2/notifications/broadcasts/b1/send').set(send);
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('SENDING');
    expect(prisma.broadcastMessage.updateMany.mock.calls[0][0]).toEqual({ where: { id: 'b1', churchId: 'church-1', status: { in: ['DRAFT', 'SCHEDULED'] } }, data: { status: 'SENDING' } });

    await vi.waitFor(() => expect(prisma.broadcastMessage.update).toHaveBeenCalled());
    expect(prisma.broadcastMessage.update.mock.calls[0][0].data).toMatchObject({ status: 'SENT', recipientCount: 2, deliveredCount: 3, skippedCount: 1, failedCount: 0 });
    expect(prisma.notification.createMany.mock.calls[0][0].data).toHaveLength(2);
    expect(prisma.notification.createMany.mock.calls[0][0].data[0]).toMatchObject({ broadcastId: 'b1', category: 'ANNOUNCEMENTS' });
    expect(prisma.member.findMany.mock.calls[0][0].where).toEqual({ churchId: 'church-1', membershipStatus: 'ACTIVE' });
  });

  test('a second send loses the race and conflicts without delivering', async () => {
    prisma.broadcastMessage.findUnique.mockResolvedValue(draft({ status: 'SENDING' }));
    prisma.broadcastMessage.updateMany.mockResolvedValue({ count: 0 });
    expect((await request(app).post('/api/v2/notifications/broadcasts/b1/send').set(send)).status).toBe(409);
    expect(prisma.member.findMany).not.toHaveBeenCalled();
  });

  test('a delivery crash marks the broadcast failed', async () => {
    prisma.broadcastMessage.findUnique.mockResolvedValue(draft());
    prisma.broadcastMessage.updateMany.mockResolvedValue({ count: 1 });
    prisma.church.findUnique.mockResolvedValue({ name: 'Grace UMC' });
    prisma.member.findMany.mockRejectedValue(new Error('db down'));
    prisma.broadcastMessage.update.mockResolvedValue({});
    await request(app).post('/api/v2/notifications/broadcasts/b1/send').set(send);
    await vi.waitFor(() => expect(prisma.broadcastMessage.update).toHaveBeenCalled());
    expect(prisma.broadcastMessage.update.mock.calls[0][0].data.status).toBe('FAILED');
  });

  test('scheduling needs a future time and moves the draft to SCHEDULED', async () => {
    prisma.broadcastMessage.findUnique.mockResolvedValue(draft());
    expect((await request(app).post('/api/v2/notifications/broadcasts/b1/schedule').set(send).send({ scheduledAt: new Date(Date.now() - 1000).toISOString() })).status).toBe(400);
    prisma.broadcastMessage.updateMany.mockResolvedValue({ count: 1 });
    const when = new Date(Date.now() + 3_600_000).toISOString();
    const res = await request(app).post('/api/v2/notifications/broadcasts/b1/schedule').set(send).send({ scheduledAt: when });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'SCHEDULED', scheduledAt: when });
  });

  test('a sent broadcast cannot be cancelled', async () => {
    prisma.broadcastMessage.findUnique.mockResolvedValue(draft({ status: 'SENT' }));
    prisma.broadcastMessage.updateMany.mockResolvedValue({ count: 0 });
    expect((await request(app).post('/api/v2/notifications/broadcasts/b1/cancel').set(send)).status).toBe(409);
  });

  test('run-due sends only what it manages to claim', async () => {
    prisma.broadcastMessage.findMany.mockResolvedValue([draft({ id: 'b1', status: 'SCHEDULED' }), draft({ id: 'b2', status: 'SCHEDULED' })]);
    prisma.broadcastMessage.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    prisma.church.findUnique.mockResolvedValue({ name: 'Grace UMC' });
    prisma.member.findMany.mockResolvedValue([]);
    prisma.broadcastMessage.update.mockResolvedValue({});
    const res = await request(app).post('/api/v2/notifications/broadcasts/run-due').set(send);
    expect(res.body).toEqual({ due: 2, sent: 1 });
    expect(prisma.broadcastMessage.findMany.mock.calls[0][0].where).toMatchObject({ status: 'SCHEDULED', churchId: 'church-1' });
  });

  test('list is scoped to the church', async () => {
    prisma.broadcastMessage.findMany.mockResolvedValue([draft()]);
    prisma.broadcastMessage.count.mockResolvedValue(1);
    const res = await request(app).get('/api/v2/notifications/broadcasts?status=DRAFT').set(create);
    expect(res.body.total).toBe(1);
    expect(prisma.broadcastMessage.findMany.mock.calls[0][0].where).toEqual({ churchId: 'church-1', status: 'DRAFT' });
  });
});
