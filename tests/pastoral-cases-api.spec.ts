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
import { pastoralCaseRepository } from '@/features/pastoral/cases/repository';

const prisma = mocked.prisma as ReturnType<typeof withLegacyModels<ReturnType<typeof createMockPrisma>>>;
const app = createApp();
const base = '/api/v2/pastoral/cases';

const tokenFor = (memberId: string | null, permissions: string[]) => ({
  Authorization: `Bearer ${jwt.sign({ sub: 'user-1', email: 'u1@example.com', churchId: 'church-1', memberId, permissions, sessionId: 's1', tokenId: 't1' }, jwtSecret, { expiresIn: '5m' })}`,
});
const as = (...permissions: string[]) => tokenFor('member-1', permissions);
const ALL = ['pastoral:case:view', 'pastoral:case:create', 'pastoral:case:update', 'pastoral:case:close'];

const record = (over: Record<string, unknown> = {}) => ({
  id: 'case-1', churchId: 'church-1', memberId: 'member-2', category: 'FAMILY', concern: 'Struggling after a bereavement', priority: 'NORMAL', status: 'OPEN',
  openedAt: new Date('2026-01-01'), openedBy: 'member-1', createdAt: new Date(), updatedAt: new Date(),
  member: { firstName: 'Ann', lastName: 'Moyo' }, assignedPastor: null, _count: { activities: 2 }, ...over,
});
const newCase = { memberId: 'member-2', category: 'FAMILY', concern: 'Struggling after a bereavement' };

beforeEach(() => {
  vi.resetAllMocks();
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.auditLog.create.mockResolvedValue({});
});

describe('permissions', () => {
  const routes: Array<[string, string, string]> = [
    ['get', '', 'pastoral:case:view'], ['post', '', 'pastoral:case:create'], ['get', '/c1', 'pastoral:case:view'], ['put', '/c1', 'pastoral:case:update'],
    ['post', '/c1/close', 'pastoral:case:close'], ['post', '/c1/activities', 'pastoral:case:update'], ['get', '/c1/timeline', 'pastoral:case:view'],
  ];
  test.each(routes)('%s %s needs sign-in and %s', async (method, path, perm) => {
    expect((await (request(app) as any)[method](base + path)).status).toBe(401);
    expect((await (request(app) as any)[method](base + path).set(as(...ALL.filter((p) => p !== perm)))).status).toBe(403);
  });
});

describe('listing and reading', () => {
  test('always scoped to the church; filters and paging are passed through and clamped', async () => {
    prisma.pastoralCase.findMany.mockResolvedValue([record()]);
    prisma.pastoralCase.count.mockResolvedValue(1);
    const res = await request(app).get(`${base}?status=OPEN&priority=HIGH&memberId=member-2&assignedPastorId=member-3&skip=-5&take=500`).set(as('pastoral:case:view'));
    expect(res.status).toBe(200);
    const args = prisma.pastoralCase.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ churchId: 'church-1', status: 'OPEN', priority: 'HIGH', memberId: 'member-2', assignedPastorId: 'member-3' });
    expect(args.take).toBe(100);
    expect(args.skip).toBe(0);
    expect(res.body.cases[0]).toMatchObject({ memberName: 'Ann Moyo', activityCount: 2 });
  });

  test('defaults and non-numeric paging', async () => {
    prisma.pastoralCase.findMany.mockResolvedValue([]);
    prisma.pastoralCase.count.mockResolvedValue(0);
    await request(app).get(`${base}?take=abc`).set(as('pastoral:case:view'));
    expect(prisma.pastoralCase.findMany.mock.calls[0][0]).toMatchObject({ where: { churchId: 'church-1' }, take: 20, skip: 0 });
  });

  test('a case of another church is 404 for get and timeline', async () => {
    prisma.pastoralCase.findUnique.mockResolvedValue(record({ churchId: 'church-2' }));
    expect((await request(app).get(`${base}/case-1`).set(as('pastoral:case:view'))).status).toBe(404);
    expect((await request(app).get(`${base}/case-1/timeline`).set(as('pastoral:case:view'))).status).toBe(404);
    prisma.pastoralCase.findUnique.mockResolvedValue(null);
    expect((await request(app).get(`${base}/case-1`).set(as('pastoral:case:view'))).status).toBe(404);
    expect(prisma.pastoralCaseActivity.findMany).not.toHaveBeenCalled();
  });

  test('timeline returns activities newest first', async () => {
    prisma.pastoralCase.findUnique.mockResolvedValue(record());
    prisma.pastoralCaseActivity.findMany.mockResolvedValue([{ id: 'a1' }]);
    const res = await request(app).get(`${base}/case-1/timeline`).set(as('pastoral:case:view'));
    expect(res.body).toEqual([{ id: 'a1' }]);
    expect(prisma.pastoralCaseActivity.findMany.mock.calls[0][0]).toEqual({ where: { caseId: 'case-1' }, orderBy: { occurredAt: 'desc' } });
  });
});

describe('opening a case', () => {
  const post = (body: object = newCase) => request(app).post(base).set(as('pastoral:case:create')).send(body);

  test('creates an OPEN case for a member of this church, opened by the caller, and audits it', async () => {
    prisma.member.findFirst.mockResolvedValue({ id: 'member-2' });
    prisma.pastoralCase.create.mockResolvedValue(record());
    const res = await post({ ...newCase, assignedPastorId: 'pastor-1', priority: 'URGENT' });
    expect(res.status).toBe(201);
    expect(prisma.member.findFirst.mock.calls.map((c) => c[0].where)).toEqual([{ id: 'member-2', churchId: 'church-1' }, { id: 'pastor-1', churchId: 'church-1' }]);
    expect(prisma.pastoralCase.create.mock.calls[0][0].data).toMatchObject({ churchId: 'church-1', memberId: 'member-2', openedBy: 'member-1', status: 'OPEN', priority: 'URGENT', assignedPastorId: 'pastor-1' });
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'PASTORAL_CASE_OPENED', entityType: 'PASTORAL_CASE', actorId: 'member-1', churchId: 'church-1' });
  });

  test('priority defaults to NORMAL', async () => {
    prisma.member.findFirst.mockResolvedValue({ id: 'member-2' });
    prisma.pastoralCase.create.mockResolvedValue(record());
    await post();
    expect(prisma.pastoralCase.create.mock.calls[0][0].data.priority).toBe('NORMAL');
  });

  test('validation', async () => {
    expect((await post({ ...newCase, concern: 'short' })).status).toBe(400);
    expect((await post({ ...newCase, category: 'GOSSIP' })).status).toBe(400);
    expect((await post({ ...newCase, priority: 'MEGA' })).status).toBe(400);
    expect((await post({ ...newCase, memberId: '' })).status).toBe(400);
    expect(prisma.pastoralCase.create).not.toHaveBeenCalled();
  });

  test('the member and the assigned pastor must belong to this church', async () => {
    prisma.member.findFirst.mockResolvedValue(null);
    expect((await post()).status).toBe(404);
    prisma.member.findFirst.mockResolvedValueOnce({ id: 'member-2' }).mockResolvedValueOnce(null);
    expect((await post({ ...newCase, assignedPastorId: 'outsider' })).status).toBe(404);
    expect(prisma.pastoralCase.create).not.toHaveBeenCalled();
  });

  test('an account without a linked member cannot do pastoral case work', async () => {
    const res = await request(app).post(base).set(tokenFor(null, ALL)).send(newCase);
    expect(res.status).toBe(400);
    expect(prisma.pastoralCase.create).not.toHaveBeenCalled();
  });
});

describe('updating', () => {
  const put = (body: object, ...perms: string[]) => request(app).put(`${base}/case-1`).set(as(...(perms.length ? perms : ['pastoral:case:update']))).send(body);

  test('applies the change and audits it', async () => {
    prisma.pastoralCase.findUnique.mockResolvedValue(record());
    prisma.pastoralCase.update.mockResolvedValue(record({ priority: 'HIGH' }));
    prisma.member.findFirst.mockResolvedValue({ id: 'pastor-1' });
    const res = await put({ priority: 'HIGH', assignedPastorId: 'pastor-1' });
    expect(res.status).toBe(200);
    expect(prisma.pastoralCase.update.mock.calls[0][0]).toMatchObject({ where: { id: 'case-1' }, data: { priority: 'HIGH', assignedPastorId: 'pastor-1' } });
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('PASTORAL_CASE_UPDATED');
  });

  test('a closed case cannot be changed', async () => {
    prisma.pastoralCase.findUnique.mockResolvedValue(record({ status: 'CLOSED' }));
    expect((await put({ priority: 'HIGH' })).status).toBe(400);
    expect(prisma.pastoralCase.update).not.toHaveBeenCalled();
  });

  test('another church or unknown case is 404; the new pastor must be in this church; bad status is 400', async () => {
    prisma.pastoralCase.findUnique.mockResolvedValue(record({ churchId: 'church-2' }));
    expect((await put({ priority: 'HIGH' })).status).toBe(404);
    prisma.pastoralCase.findUnique.mockResolvedValue(record());
    prisma.member.findFirst.mockResolvedValue(null);
    expect((await put({ assignedPastorId: 'outsider' })).status).toBe(404);
    expect((await put({ status: 'DONE' })).status).toBe(400);
    expect(prisma.pastoralCase.update).not.toHaveBeenCalled();
  });

  test('closing through the update route is refused; closing goes through POST /:id/close', async () => {
    prisma.pastoralCase.findUnique.mockResolvedValue(record());
    prisma.pastoralCase.update.mockResolvedValue(record({ status: 'CLOSED' }));
    const res = await put({ status: 'CLOSED' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/close action/);
    expect(prisma.pastoralCase.update).not.toHaveBeenCalled();
  });
});

describe('closing', () => {
  const close = (body: object = { resolvedReason: 'Family reconciled after counselling' }) => request(app).post(`${base}/case-1/close`).set(as('pastoral:case:close')).send(body);

  test('needs a real reason', async () => {
    expect((await close({ resolvedReason: 'done' })).status).toBe(400);
    expect((await close({})).status).toBe(400);
    expect(prisma.pastoralCase.findUnique).not.toHaveBeenCalled();
  });

  test('closes the case, stamps the resolution and audits the previous status', async () => {
    prisma.pastoralCase.findUnique.mockResolvedValue(record({ status: 'IN_PROGRESS' }));
    prisma.pastoralCase.update.mockResolvedValue(record({ status: 'CLOSED' }));
    const res = await close();
    expect(res.status).toBe(200);
    const data = prisma.pastoralCase.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: 'CLOSED', resolvedReason: 'Family reconciled after counselling' });
    expect(data.resolvedAt).toBeInstanceOf(Date);
    expect(data.closedAt).toBeInstanceOf(Date);
    const audit = prisma.auditLog.create.mock.calls[0][0].data;
    expect(audit.action).toBe('PASTORAL_CASE_CLOSED');
    expect(JSON.parse(audit.changes)).toEqual({ previousStatus: 'IN_PROGRESS', status: 'CLOSED' });
  });

  test('an already closed or foreign case is not closed again', async () => {
    prisma.pastoralCase.findUnique.mockResolvedValue(record({ status: 'CLOSED' }));
    expect((await close()).status).toBe(409);
    prisma.pastoralCase.findUnique.mockResolvedValue(record({ churchId: 'church-2' }));
    expect((await close()).status).toBe(404);
    expect(prisma.pastoralCase.update).not.toHaveBeenCalled();
  });
});

describe('activities', () => {
  const add = (body: object = { activityType: 'PHONE_CALL', description: 'Called the family to check in' }) => request(app).post(`${base}/case-1/activities`).set(as('pastoral:case:update')).send(body);

  test('records an activity attributed to the caller and audits it', async () => {
    prisma.pastoralCase.findUnique.mockResolvedValue(record());
    prisma.pastoralCaseActivity.create.mockResolvedValue({ id: 'act-1' });
    const res = await add();
    expect(res.status).toBe(201);
    const data = prisma.pastoralCaseActivity.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ caseId: 'case-1', actorId: 'member-1', activityType: 'PHONE_CALL' });
    expect(data.occurredAt).toBeInstanceOf(Date);
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('PASTORAL_CASE_ACTIVITY_ADDED');
  });

  test('validation, closed and foreign cases', async () => {
    expect((await add({ activityType: 'PHONE_CALL', description: 'short' })).status).toBe(400);
    expect((await add({ activityType: 'TELEPATHY', description: 'Called the family to check in' })).status).toBe(400);
    prisma.pastoralCase.findUnique.mockResolvedValue(record({ status: 'CLOSED' }));
    expect((await add()).status).toBe(400);
    prisma.pastoralCase.findUnique.mockResolvedValue(record({ churchId: 'church-2' }));
    expect((await add()).status).toBe(404);
    expect(prisma.pastoralCaseActivity.create).not.toHaveBeenCalled();
  });
});

describe('repository queries', () => {
  test('counts are scoped to the church', async () => {
    prisma.pastoralCase.count.mockResolvedValue(3);
    expect(await pastoralCaseRepository.countByStatus('church-1', 'OPEN')).toBe(3);
    await pastoralCaseRepository.countByPriority('church-1', 'HIGH');
    await pastoralCaseRepository.countByCategory('church-1', 'FAMILY');
    expect(prisma.pastoralCase.count.mock.calls.map((c) => c[0].where)).toEqual([
      { churchId: 'church-1', status: 'OPEN' }, { churchId: 'church-1', priority: 'HIGH' }, { churchId: 'church-1', category: 'FAMILY' },
    ]);
  });

  test('high priority cases exclude closed ones and are limited to 10', async () => {
    prisma.pastoralCase.findMany.mockResolvedValue([record({ priority: 'URGENT' })]);
    const rows = await pastoralCaseRepository.getHighPriority('church-1');
    expect(prisma.pastoralCase.findMany.mock.calls[0][0]).toMatchObject({ where: { churchId: 'church-1', priority: { in: ['HIGH', 'URGENT'] }, status: { not: 'CLOSED' } }, take: 10 });
    expect(rows[0].priority).toBe('URGENT');
  });

  test('member and pastor views are church scoped; the pastor view hides closed cases', async () => {
    prisma.pastoralCase.findMany.mockResolvedValue([]);
    await pastoralCaseRepository.getByMember('member-2', 'church-1');
    await pastoralCaseRepository.getByAssignedPastor('pastor-1', 'church-1');
    expect(prisma.pastoralCase.findMany.mock.calls[0][0].where).toEqual({ memberId: 'member-2', churchId: 'church-1' });
    expect(prisma.pastoralCase.findMany.mock.calls[1][0].where).toEqual({ churchId: 'church-1', assignedPastorId: 'pastor-1', status: { not: 'CLOSED' } });
  });

  test('overdue follow-ups are pending, past due, church scoped and named', async () => {
    prisma.pastoralFollowUp.findMany.mockResolvedValue([{ id: 'f1', caseId: 'case-1', memberId: 'member-2', reason: 'Check in', dueDate: new Date('2026-01-01'), member: { firstName: 'Ann', lastName: 'Moyo' } }]);
    const rows = await pastoralCaseRepository.getOverdueFollowUps('church-1');
    const where = prisma.pastoralFollowUp.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ churchId: 'church-1', status: 'PENDING' });
    expect(where.dueDate.lt).toBeInstanceOf(Date);
    expect(rows[0]).toMatchObject({ memberName: 'Ann Moyo', isOverdue: true });
  });

  test('update, close, activity and timeline re-check the church themselves', async () => {
    prisma.pastoralCase.findUnique.mockResolvedValue(record({ churchId: 'church-2' }));
    await expect(pastoralCaseRepository.update('case-1', 'church-1', {})).rejects.toThrow('Case not found');
    await expect(pastoralCaseRepository.close('case-1', 'church-1', 'reason reason')).rejects.toThrow('Case not found');
    await expect(pastoralCaseRepository.addActivity('case-1', 'church-1', { activityType: 'NOTE', description: 'x', actorId: 'm', occurredAt: new Date() })).rejects.toThrow('Case not found');
    await expect(pastoralCaseRepository.getTimeline('case-1', 'church-1')).rejects.toThrow('Case not found');
    expect(prisma.pastoralCase.update).not.toHaveBeenCalled();
    expect(prisma.pastoralCaseActivity.create).not.toHaveBeenCalled();
  });
});
