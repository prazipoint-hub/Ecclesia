import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { createMockPrisma } from './helpers/mockPrisma';
import type { withLegacyModels } from './helpers/legacyMocks';

const mocked = vi.hoisted(() => ({ prisma: undefined as unknown }));

vi.mock('@/database', async () => {
  const { createMockPrisma: create } = await import('./helpers/mockPrisma');
  const { withLegacyModels: extend } = await import('./helpers/legacyMocks');
  mocked.prisma = extend(create());
  return { prisma: mocked.prisma, default: mocked.prisma };
});

import { createApp } from '@/app';
import { jwtSecret } from '@/config/secrets';

const prisma = mocked.prisma as ReturnType<typeof withLegacyModels<ReturnType<typeof createMockPrisma>>>;
const app = createApp();
const base = '/api/v2/membership';

const as = (...permissions: string[]) => ({
  Authorization: `Bearer ${jwt.sign({ sub: 'user-1', email: 'u1@example.com', churchId: 'church-1', memberId: 'member-1', permissions, sessionId: 's1', tokenId: 't1' }, jwtSecret, { expiresIn: '5m' })}`,
});

const UUID = '3f2b8c1e-5a4d-4e7b-9c1a-0d2e4f6a8b10';
const REQ_ID = '8a1d9f3c-2b7e-4c5d-a6f1-3e9b7c5d1a02';
const member = (over: Record<string, unknown> = {}) => ({ id: UUID, churchId: 'church-1', membershipStatus: 'ACTIVE', ...over });
const changeRow = (over: Record<string, unknown> = {}) => ({
  id: REQ_ID, memberId: UUID, changeType: 'TRANSFER', currentStatus: 'ACTIVE', proposedStatus: 'TRANSFERRED', status: 'PENDING', requestedById: 'user-9',
  member: { id: UUID, churchId: 'church-1' }, ...over,
});
const validBody = { memberId: UUID, changeType: 'MARRIAGE', proposedStatus: 'ACTIVE', reason: 'Married at the church last week' };

beforeEach(() => {
  vi.resetAllMocks();
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.$transaction.mockImplementation((async (arg: unknown) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg as unknown[]))) as never);
  prisma.auditLog.create.mockResolvedValue({});
  prisma.notification.create.mockResolvedValue({});
  prisma.user.findMany.mockResolvedValue([]);
});

describe('permissions', () => {
  const routes: Array<[string, string, string]> = [
    ['post', '/status-changes/request', 'membership:status:request'],
    ['get', '/status-changes/pending?churchId=church-1', 'membership:status:approve'],
    ['post', `/status-changes/${REQ_ID}/approve`, 'membership:status:approve'],
    ['post', `/status-changes/${REQ_ID}/reject`, 'membership:status:approve'],
  ];
  test.each(routes)('%s %s needs sign-in and %s', async (method, path, perm) => {
    expect((await (request(app) as any)[method](base + path)).status).toBe(401);
    expect((await (request(app) as any)[method](base + path).set(as('finance:view'))).status).toBe(403);
    // holding the other half of the workflow is not enough
    const other = perm === 'membership:status:request' ? 'membership:status:approve' : 'membership:status:request';
    expect((await (request(app) as any)[method](base + path).set(as(other))).status).toBe(403);
  });
});

describe('requesting a status change', () => {
  test('creates a PENDING request and leaves the member untouched', async () => {
    prisma.member.findUnique.mockResolvedValue(member());
    prisma.membershipStatusChange.create.mockImplementation((async ({ data }: any) => ({ ...data, member: member() })) as never);
    const res = await request(app).post(`${base}/status-changes/request`).set(as('membership:status:request')).send({ ...validBody, additionalInfo: { spouse: 'X' } });
    expect(res.status).toBe(201);
    const data = prisma.membershipStatusChange.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ memberId: UUID, status: 'PENDING', currentStatus: 'ACTIVE', proposedStatus: 'ACTIVE', requestedById: 'user-1' });
    expect(data.additionalInfo).toBe('{"spouse":"X"}');
    expect(prisma.member.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('DEATH and TRANSFER force the proposed status regardless of the body', async () => {
    prisma.member.findUnique.mockResolvedValue(member());
    prisma.membershipStatusChange.create.mockImplementation((async ({ data }: any) => ({ ...data, member: member() })) as never);
    await request(app).post(`${base}/status-changes/request`).set(as('membership:status:request')).send({ ...validBody, changeType: 'DEATH', proposedStatus: 'ACTIVE' });
    await request(app).post(`${base}/status-changes/request`).set(as('membership:status:request')).send({ ...validBody, changeType: 'TRANSFER', proposedStatus: 'ACTIVE' });
    expect(prisma.membershipStatusChange.create.mock.calls[0][0].data.proposedStatus).toBe('DECEASED');
    expect(prisma.membershipStatusChange.create.mock.calls[1][0].data.proposedStatus).toBe('TRANSFERRED');
  });

  test('audits the request and notifies everyone in the church', async () => {
    prisma.member.findUnique.mockResolvedValue(member());
    prisma.membershipStatusChange.create.mockImplementation((async ({ data }: any) => ({ ...data, member: member() })) as never);
    prisma.user.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
    await request(app).post(`${base}/status-changes/request`).set(as('membership:status:request')).send(validBody);
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'MEMBERSHIP_CHANGE_REQUESTED', actorId: 'user-1', churchId: 'church-1', entityType: 'MEMBERSHIP_STATUS_CHANGE' });
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({ churchId: 'church-1' });
    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
    expect(prisma.notification.create.mock.calls[0][0].data).toMatchObject({ recipientId: 'p1', type: 'MEMBERSHIP_APPROVAL_PENDING' });
  });

  test('validation: ids, change type, status and reason', async () => {
    const post = (body: unknown) => request(app).post(`${base}/status-changes/request`).set(as('membership:status:request')).send(body as object);
    expect((await post({ ...validBody, memberId: '' })).status).toBe(400);
    expect((await post({ ...validBody, changeType: 'PROMOTION' })).status).toBe(400);
    expect((await post({ ...validBody, proposedStatus: 'ARCHIVED' })).status).toBe(400);
    expect((await post({ ...validBody, reason: '' })).status).toBe(400);
    expect(prisma.membershipStatusChange.create).not.toHaveBeenCalled();
  });

  test('unknown member is 404; member of another church is refused', async () => {
    prisma.member.findUnique.mockResolvedValue(null);
    expect((await request(app).post(`${base}/status-changes/request`).set(as('membership:status:request')).send(validBody)).status).toBe(404);
    prisma.member.findUnique.mockResolvedValue(member({ churchId: 'church-2' }));
    const res = await request(app).post(`${base}/status-changes/request`).set(as('membership:status:request')).send(validBody);
    expect([401, 403]).toContain(res.status);
    expect(prisma.membershipStatusChange.create).not.toHaveBeenCalled();
  });
});

describe('approving', () => {
  const approveOk = (row = changeRow()) => {
    prisma.membershipStatusChange.findUnique.mockResolvedValue(row);
    prisma.membershipStatusChange.updateMany.mockResolvedValue({ count: 1 });
    prisma.member.update.mockResolvedValue({});
    prisma.member.findUnique.mockResolvedValue({ id: UUID, user: { id: 'member-user' } });
  };
  const approve = (perms = ['membership:status:approve']) => request(app).post(`${base}/status-changes/${REQ_ID}/approve`).set(as(...perms));

  test('changes the member status together with the request, audits and notifies the member', async () => {
    approveOk();
    const res = await approve();
    expect(res.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.membershipStatusChange.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: REQ_ID, status: 'PENDING' }, data: { status: 'APPROVED', approvedById: 'user-1' } });
    expect(prisma.member.update.mock.calls[0][0]).toEqual({ where: { id: UUID }, data: { membershipStatus: 'TRANSFERRED' } });
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'MEMBERSHIP_CHANGE_APPROVED', actorId: 'user-1', entityId: REQ_ID });
    expect(JSON.parse(prisma.auditLog.create.mock.calls[0][0].data.changes)).toMatchObject({ previousStatus: 'ACTIVE', newStatus: 'TRANSFERRED' });
    expect(prisma.notification.create.mock.calls[0][0].data).toMatchObject({ recipientId: 'member-user', type: 'MEMBERSHIP_APPROVED' });
  });

  test('a request with no proposed status approves without touching the member', async () => {
    approveOk(changeRow({ changeType: 'OTHER', proposedStatus: null }));
    expect((await approve()).status).toBe(200);
    expect(prisma.member.update).not.toHaveBeenCalled();
  });

  test('a member without a user account is approved without a notification', async () => {
    approveOk();
    prisma.member.findUnique.mockResolvedValue({ id: UUID, user: null });
    expect((await approve()).status).toBe(200);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  test('unknown request is 404', async () => {
    prisma.membershipStatusChange.findUnique.mockResolvedValue(null);
    expect((await approve()).status).toBe(404);
  });

  test('a request for another church is refused unless the user holds the cross-church permission', async () => {
    const foreign = changeRow({ member: { id: UUID, churchId: 'church-2' } });
    approveOk(foreign);
    const denied = await approve();
    expect([401, 403]).toContain(denied.status);
    expect(prisma.member.update).not.toHaveBeenCalled();
    expect((await approve(['membership:status:approve', 'membership:status:approve:all_churches'])).status).toBe(200);
  });

  test('an already processed request answers 409 and changes nothing', async () => {
    approveOk(changeRow({ status: 'APPROVED' }));
    expect((await approve()).status).toBe(409);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  test('a rejected request cannot be approved afterwards', async () => {
    approveOk(changeRow({ status: 'REJECTED' }));
    expect((await approve()).status).toBe(409);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.member.update).not.toHaveBeenCalled();
  });

  test('the approval is an atomic claim on the pending state', async () => {
    approveOk();
    await approve();
    expect(prisma.membershipStatusChange.updateMany.mock.calls[0][0].where).toMatchObject({ id: REQ_ID, status: 'PENDING' });
  });

  test('losing the race to another approver changes nothing and is a conflict', async () => {
    approveOk();
    prisma.membershipStatusChange.updateMany.mockResolvedValue({ count: 0 });
    const res = await approve();
    expect(res.status).toBe(409);
    expect(prisma.member.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  test('the person who raised a request cannot approve it', async () => {
    approveOk(changeRow({ requestedById: 'user-1' }));
    const res = await approve(['membership:status:approve', 'membership:status:request']);
    expect(res.status).toBe(409);
    expect(prisma.membershipStatusChange.updateMany).not.toHaveBeenCalled();
    expect(prisma.member.update).not.toHaveBeenCalled();
  });
});

describe('rejecting', () => {
  const reject = (body: object = { rejectionReason: 'Not enough evidence' }, perms = ['membership:status:approve']) =>
    request(app).post(`${base}/status-changes/${REQ_ID}/reject`).set(as(...perms)).send(body);

  test('needs a reason', async () => {
    expect((await reject({})).status).toBe(400);
    expect(prisma.membershipStatusChange.findUnique).not.toHaveBeenCalled();
  });

  test('records the rejection, keeps the member as is, audits and notifies', async () => {
    prisma.membershipStatusChange.findUnique.mockResolvedValue(changeRow());
    prisma.membershipStatusChange.updateMany.mockResolvedValue({ count: 1 });
    prisma.member.findUnique.mockResolvedValue({ id: UUID, user: { id: 'member-user' } });
    expect((await reject()).status).toBe(200);
    expect(prisma.membershipStatusChange.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: REQ_ID, status: 'PENDING' }, data: { status: 'REJECTED', approvedById: 'user-1', rejectionReason: 'Not enough evidence' } });
    expect(prisma.member.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('MEMBERSHIP_CHANGE_REJECTED');
    expect(prisma.notification.create.mock.calls[0][0].data.type).toBe('MEMBERSHIP_REJECTED');
  });

  test('unknown, other-church and already-processed requests are not rejected', async () => {
    prisma.membershipStatusChange.findUnique.mockResolvedValue(null);
    expect((await reject()).status).toBe(404);
    prisma.membershipStatusChange.findUnique.mockResolvedValue(changeRow({ member: { id: UUID, churchId: 'church-2' } }));
    expect([401, 403]).toContain((await reject()).status);
    prisma.membershipStatusChange.findUnique.mockResolvedValue(changeRow({ status: 'APPROVED' }));
    expect((await reject()).status).toBe(409);
    expect(prisma.membershipStatusChange.updateMany).not.toHaveBeenCalled();
  });

  test('rejecting an already processed request answers 409', async () => {
    prisma.membershipStatusChange.findUnique.mockResolvedValue(changeRow({ status: 'APPROVED' }));
    expect((await reject()).status).toBe(409);
  });

  test('losing the race to another decision is a conflict and sends nothing', async () => {
    prisma.membershipStatusChange.findUnique.mockResolvedValue(changeRow());
    prisma.membershipStatusChange.updateMany.mockResolvedValue({ count: 0 });
    expect((await reject()).status).toBe(409);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});

describe('reading', () => {
  test('pending list needs churchId, is limited to the church and paginates', async () => {
    expect((await request(app).get(`${base}/status-changes/pending`).set(as('membership:status:approve'))).status).toBe(400);
    prisma.membershipStatusChange.findMany.mockResolvedValue([]);
    prisma.membershipStatusChange.count.mockResolvedValue(0);
    const res = await request(app).get(`${base}/status-changes/pending?churchId=church-1&skip=5&take=10`).set(as('membership:status:approve'));
    expect(res.status).toBe(200);
    const args = prisma.membershipStatusChange.findMany.mock.calls[0][0];
    expect(args).toMatchObject({ where: { status: 'PENDING', member: { churchId: 'church-1' } }, skip: 5, take: 10 });
  });

  test('pending list for another church is refused without the cross-church permission', async () => {
    const res = await request(app).get(`${base}/status-changes/pending?churchId=church-2`).set(as('membership:status:approve'));
    expect([401, 403]).toContain(res.status);
    expect(prisma.membershipStatusChange.findMany).not.toHaveBeenCalled();
  });

  test('a single request is visible to its own church only', async () => {
    prisma.membershipStatusChange.findUnique.mockResolvedValue(changeRow());
    expect((await request(app).get(`${base}/status-changes/${REQ_ID}`).set(as())).status).toBe(200);
    prisma.membershipStatusChange.findUnique.mockResolvedValue(changeRow({ member: { id: UUID, churchId: 'church-2' } }));
    expect([401, 403]).toContain((await request(app).get(`${base}/status-changes/${REQ_ID}`).set(as())).status);
    expect((await request(app).get(`${base}/status-changes/${REQ_ID}`).set(as('membership:view:all_churches'))).status).toBe(200);
    prisma.membershipStatusChange.findUnique.mockResolvedValue(null);
    expect((await request(app).get(`${base}/status-changes/${REQ_ID}`).set(as())).status).toBe(404);
  });

  test('approval history only shows decided requests and respects church boundaries', async () => {
    prisma.member.findUnique.mockResolvedValue({ churchId: 'church-1' });
    prisma.membershipStatusChange.findMany.mockResolvedValue([]);
    expect((await request(app).get(`${base}/approval-history/${UUID}`).set(as())).status).toBe(200);
    expect(prisma.membershipStatusChange.findMany.mock.calls[0][0].where).toEqual({ memberId: UUID, status: { in: ['APPROVED', 'REJECTED'] } });
    prisma.member.findUnique.mockResolvedValue({ churchId: 'church-2' });
    expect([401, 403]).toContain((await request(app).get(`${base}/approval-history/${UUID}`).set(as())).status);
    prisma.member.findUnique.mockResolvedValue(null);
    expect((await request(app).get(`${base}/approval-history/${UUID}`).set(as())).status).toBe(404);
  });
});
