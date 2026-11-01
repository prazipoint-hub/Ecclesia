import jwt from 'jsonwebtoken';
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
import { settingsReader } from '@/features/admin/service/settings';
import { checkInWindow } from '@/features/events/service/common';

const prisma = mocked.prisma as ReturnType<typeof createMockPrisma>;
const app = createApp();
const base = '/api/v2/admin';

const ALL = ['admin:user:manage', 'admin:role:manage', 'admin:settings:manage', 'admin:audit:view', 'admin:retention:manage', 'admin:api:view', 'finance:view'];
const as = (...permissions: string[]) => ({
  Authorization: `Bearer ${jwt.sign({ sub: 'user-1', email: 'u1@example.com', churchId: 'church-1', memberId: 'member-1', permissions, sessionId: 's1', tokenId: 't1' }, jwtSecret, { expiresIn: '5m' })}`,
});
const admin = () => as(...ALL);

const role = (over: Record<string, unknown> = {}, perms: string[] = ['finance:view'], assignments = 0) => ({
  id: 'r1', churchId: 'church-1', name: 'Treasurer', description: null,
  permissions: perms.map((name) => ({ permission: { id: `p-${name}`, name } })), _count: { assignments }, ...over,
});
const userRec = (over: Record<string, unknown> = {}) => ({
  id: 'u2', email: 'u2@example.com', emailVerified: true, memberId: 'member-2', createdAt: new Date(), disabledAt: null, disabledReason: null,
  twoFactorSecret: null, sessions: [], member: { firstName: 'A', lastName: 'B', membershipNumber: 'M1', leadershipAssignments: [] }, ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.$transaction.mockImplementation((async (arg: unknown) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg as unknown[]))) as never);
  prisma.auditLog.create.mockResolvedValue({});
  prisma.systemSetting.findUnique.mockResolvedValue(null);
  prisma.systemSetting.findMany.mockResolvedValue([]);
});

describe('permissions on every route', () => {
  const routes: Array<[string, string]> = [
    ['get', '/permissions'], ['get', '/roles'], ['post', '/roles'], ['get', '/roles/r1'], ['put', '/roles/r1'], ['put', '/roles/r1/permissions'], ['delete', '/roles/r1'],
    ['get', '/users'], ['get', '/users/u2'], ['post', '/users/u2/disable'], ['post', '/users/u2/enable'], ['post', '/users/u2/revoke-sessions'], ['post', '/users/u2/roles'],
    ['delete', '/users/u2/roles/a1'], ['get', '/settings'], ['put', '/settings/events.absenceThreshold'], ['delete', '/settings/events.absenceThreshold'],
    ['get', '/audit-logs'], ['get', '/audit-logs/export'], ['get', '/retention'], ['put', '/retention'], ['delete', '/retention/AUDIT_LOG'], ['post', '/retention/run'], ['get', '/api-reference'],
  ];
  test.each(routes)('%s %s needs sign-in and the right permission', async (method, path) => {
    expect((await (request(app) as any)[method](base + path)).status).toBe(401);
    expect((await (request(app) as any)[method](base + path).set(as('finance:view'))).status).toBe(403);
  });
});

describe('roles', () => {
  test('lists only the church roles', async () => {
    prisma.role.findMany.mockResolvedValue([{ id: 'r1', name: 'T', description: null, _count: { permissions: 2, assignments: 1 } }]);
    const res = await request(app).get(`${base}/roles`).set(admin());
    expect(res.status).toBe(200);
    expect(prisma.role.findMany.mock.calls[0][0].where).toEqual({ churchId: 'church-1' });
    expect(res.body[0]).toMatchObject({ permissionCount: 2, assignmentCount: 1 });
  });

  test('cannot create a role granting a permission you do not hold', async () => {
    prisma.permission.findMany.mockResolvedValue([{ id: 'p1', name: 'finance:view' }, { id: 'p2', name: 'pastoral:l4:access' }]);
    const res = await request(app).post(`${base}/roles`).set(as('admin:role:manage', 'finance:view')).send({ name: 'Sneaky', permissions: ['finance:view', 'pastoral:l4:access'] });
    expect(res.status).toBe(403);
    expect(prisma.role.create).not.toHaveBeenCalled();
  });

  test('rejects unknown permission names', async () => {
    prisma.permission.findMany.mockResolvedValue([]);
    const res = await request(app).post(`${base}/roles`).set(admin()).send({ name: 'X1', permissions: ['finance:view'] });
    expect(res.status).toBe(400);
  });

  test('creates a role with permissions and audits it', async () => {
    prisma.permission.findMany.mockResolvedValue([{ id: 'p1', name: 'finance:view' }]);
    prisma.role.create.mockResolvedValue({ id: 'r1' });
    prisma.role.findFirst.mockResolvedValue(role());
    prisma.leadershipAssignment.findMany.mockResolvedValue([]);
    const res = await request(app).post(`${base}/roles`).set(admin()).send({ name: 'Treasurer', permissions: ['finance:view'] });
    expect(res.status).toBe(201);
    expect(prisma.role.create.mock.calls[0][0].data).toMatchObject({ churchId: 'church-1', name: 'Treasurer' });
    expect(prisma.rolePermission.createMany).toHaveBeenCalled();
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('ROLE_CREATED');
  });

  test('duplicate name is a conflict', async () => {
    const { Prisma } = await import('@prisma/client');
    prisma.role.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    const res = await request(app).post(`${base}/roles`).set(admin()).send({ name: 'Treasurer' });
    expect(res.status).toBe(409);
  });

  test('another church role is not found', async () => {
    prisma.role.findFirst.mockResolvedValue(null);
    expect((await request(app).get(`${base}/roles/r9`).set(admin())).status).toBe(404);
    expect(prisma.role.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'r9', churchId: 'church-1' });
  });

  test('cannot edit a role carrying permissions above yours', async () => {
    prisma.role.findFirst.mockResolvedValue(role({}, ['finance:view', 'pastoral:l4:access']));
    const res = await request(app).put(`${base}/roles/r1/permissions`).set(as('admin:role:manage', 'finance:view')).send({ permissions: ['finance:view'] });
    expect(res.status).toBe(403);
    expect(prisma.rolePermission.deleteMany).not.toHaveBeenCalled();
  });

  test('removing permissions signs holders out', async () => {
    prisma.role.findFirst.mockResolvedValue(role({}, ['finance:view']));
    prisma.permission.findMany.mockResolvedValue([]);
    prisma.leadershipAssignment.findMany.mockResolvedValue([{ id: 'a1', member: { id: 'member-2' } }]);
    prisma.user.findMany.mockResolvedValue([{ id: 'u2' }]);
    prisma.session.deleteMany.mockResolvedValue({ count: 1 });
    const res = await request(app).put(`${base}/roles/r1/permissions`).set(admin()).send({ permissions: [] });
    expect(res.status).toBe(200);
    expect(prisma.rolePermission.deleteMany).toHaveBeenCalled();
    expect(prisma.session.deleteMany.mock.calls[0][0].where).toEqual({ userId: { in: ['u2'] } });
  });

  test('granting only (nothing removed) does not sign anyone out', async () => {
    prisma.role.findFirst.mockResolvedValue(role({}, []));
    prisma.permission.findMany.mockResolvedValue([{ id: 'p1', name: 'finance:view' }]);
    prisma.leadershipAssignment.findMany.mockResolvedValue([]);
    const res = await request(app).put(`${base}/roles/r1/permissions`).set(admin()).send({ permissions: ['finance:view'] });
    expect(res.status).toBe(200);
    expect(prisma.session.deleteMany).not.toHaveBeenCalled();
  });

  test('cannot strip user-admin from the only role that has it', async () => {
    prisma.role.findFirst.mockResolvedValue(role({}, ['admin:user:manage']));
    prisma.permission.findMany.mockResolvedValue([]);
    prisma.leadershipAssignment.findMany.mockResolvedValue([]);
    const res = await request(app).put(`${base}/roles/r1/permissions`).set(admin()).send({ permissions: [] });
    expect(res.status).toBe(409);
    expect(prisma.rolePermission.deleteMany).not.toHaveBeenCalled();
  });

  test('a role with assignment history cannot be deleted', async () => {
    prisma.role.findFirst.mockResolvedValue(role({}, ['finance:view'], 3));
    const res = await request(app).delete(`${base}/roles/r1`).set(admin());
    expect(res.status).toBe(409);
    expect(prisma.role.delete).not.toHaveBeenCalled();
  });

  test('an unused role is deleted', async () => {
    prisma.role.findFirst.mockResolvedValue(role({}, ['finance:view'], 0));
    prisma.role.delete.mockResolvedValue({});
    expect((await request(app).delete(`${base}/roles/r1`).set(admin())).status).toBe(200);
    expect(prisma.role.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
  });

  test('empty update and unknown fields are rejected', async () => {
    expect((await request(app).put(`${base}/roles/r1`).set(admin()).send({})).status).toBe(400);
    expect((await request(app).put(`${base}/roles/r1`).set(admin()).send({ name: 'Ok', churchId: 'other' })).status).toBe(400);
  });
});

describe('users', () => {
  test('list is scoped to the church', async () => {
    prisma.user.findMany.mockResolvedValue([userRec()]);
    prisma.user.count.mockResolvedValue(1);
    const res = await request(app).get(`${base}/users?status=ACTIVE`).set(admin());
    expect(res.status).toBe(200);
    expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({ churchId: 'church-1', disabledAt: null });
    expect(res.body.items[0]).not.toHaveProperty('passwordHash');
  });

  test('cannot switch off yourself', async () => {
    const res = await request(app).post(`${base}/users/user-1/disable`).set(admin()).send({ reason: 'testing it out' });
    expect(res.status).toBe(409);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  test('a reason is required', async () => {
    expect((await request(app).post(`${base}/users/u2/disable`).set(admin()).send({ reason: 'no' })).status).toBe(400);
  });

  test('cannot switch off the last administrator', async () => {
    prisma.user.findFirst.mockResolvedValue(userRec());
    prisma.leadershipAssignment.findMany.mockResolvedValue([{ memberId: 'member-2' }]);
    prisma.user.count.mockResolvedValue(0);
    const res = await request(app).post(`${base}/users/u2/disable`).set(admin()).send({ reason: 'left the church' });
    expect(res.status).toBe(409);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  test('disables atomically and deletes sessions', async () => {
    prisma.user.findFirst.mockResolvedValue(userRec());
    prisma.leadershipAssignment.findMany.mockResolvedValue([{ memberId: 'member-1' }]);
    prisma.user.count.mockResolvedValue(1);
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.session.deleteMany.mockResolvedValue({ count: 2 });
    const res = await request(app).post(`${base}/users/u2/disable`).set(admin()).send({ reason: 'left the church' });
    expect(res.status).toBe(200);
    expect(prisma.user.updateMany.mock.calls[0][0].where).toEqual({ id: 'u2', disabledAt: null });
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u2' } });
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('USER_DISABLED');
  });

  test('losing the claim race is a conflict and keeps sessions', async () => {
    prisma.user.findFirst.mockResolvedValue(userRec());
    prisma.leadershipAssignment.findMany.mockResolvedValue([{ memberId: 'member-1' }]);
    prisma.user.count.mockResolvedValue(1);
    prisma.user.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(app).post(`${base}/users/u2/disable`).set(admin()).send({ reason: 'left the church' });
    expect(res.status).toBe(409);
    expect(prisma.session.deleteMany).not.toHaveBeenCalled();
  });

  test('already disabled account cannot be disabled again; enabled cannot be enabled', async () => {
    prisma.user.findFirst.mockResolvedValue(userRec({ disabledAt: new Date() }));
    expect((await request(app).post(`${base}/users/u2/disable`).set(admin()).send({ reason: 'left the church' })).status).toBe(409);
    prisma.user.findFirst.mockResolvedValue(userRec());
    expect((await request(app).post(`${base}/users/u2/enable`).set(admin())).status).toBe(409);
  });

  test('enables a disabled account', async () => {
    prisma.user.findFirst.mockResolvedValue(userRec({ disabledAt: new Date() }));
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    expect((await request(app).post(`${base}/users/u2/enable`).set(admin())).status).toBe(200);
    expect(prisma.user.updateMany.mock.calls[0][0].data).toEqual({ disabledAt: null, disabledReason: null });
  });

  test('user of another church is not found', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    expect((await request(app).get(`${base}/users/u9`).set(admin())).status).toBe(404);
    expect(prisma.user.findFirst.mock.calls[0][0].where).toEqual({ id: 'u9', churchId: 'church-1' });
  });

  test('assigning a role above your power is forbidden', async () => {
    prisma.user.findFirst.mockResolvedValue(userRec());
    prisma.role.findFirst.mockResolvedValue(role({}, ['pastoral:l4:access']));
    const res = await request(app).post(`${base}/users/u2/roles`).set(as('admin:user:manage', 'finance:view')).send({ roleId: 'r1' });
    expect(res.status).toBe(403);
    expect(prisma.leadershipAssignment.create).not.toHaveBeenCalled();
  });

  test('assigning a duplicate active role is a conflict; a good one is created', async () => {
    prisma.user.findFirst.mockResolvedValue(userRec());
    prisma.role.findFirst.mockResolvedValue(role());
    prisma.leadershipAssignment.findFirst.mockResolvedValue({ id: 'a0' });
    expect((await request(app).post(`${base}/users/u2/roles`).set(admin()).send({ roleId: 'r1' })).status).toBe(409);
    prisma.leadershipAssignment.findFirst.mockResolvedValue(null);
    prisma.leadershipAssignment.create.mockResolvedValue({ id: 'a1' });
    expect((await request(app).post(`${base}/users/u2/roles`).set(admin()).send({ roleId: 'r1' })).status).toBe(201);
    expect(prisma.leadershipAssignment.create.mock.calls[0][0].data).toMatchObject({ churchId: 'church-1', memberId: 'member-2', roleId: 'r1' });
  });

  test('account without a member cannot hold a role', async () => {
    prisma.user.findFirst.mockResolvedValue(userRec({ memberId: null, member: null }));
    expect((await request(app).post(`${base}/users/u2/roles`).set(admin()).send({ roleId: 'r1' })).status).toBe(400);
  });

  test('ending a role signs the person out', async () => {
    prisma.user.findFirst.mockResolvedValue(userRec());
    prisma.leadershipAssignment.findFirst.mockResolvedValue({ id: 'a1', memberId: 'member-2', role: { name: 'T', permissions: [{ permission: { name: 'finance:view' } }] } });
    prisma.leadershipAssignment.updateMany.mockResolvedValue({ count: 1 });
    prisma.session.deleteMany.mockResolvedValue({ count: 1 });
    expect((await request(app).delete(`${base}/users/u2/roles/a1`).set(admin())).status).toBe(200);
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: { in: ['u2'] } } });
  });

  test('assignment belonging to someone else is not found', async () => {
    prisma.user.findFirst.mockResolvedValue(userRec());
    prisma.leadershipAssignment.findFirst.mockResolvedValue({ id: 'a1', memberId: 'member-9', role: { name: 'T', permissions: [] } });
    expect((await request(app).delete(`${base}/users/u2/roles/a1`).set(admin())).status).toBe(404);
  });

  test('cannot end the last user-admin assignment', async () => {
    prisma.user.findFirst.mockResolvedValue(userRec());
    prisma.leadershipAssignment.findFirst.mockResolvedValue({ id: 'a1', memberId: 'member-2', role: { name: 'Admin', permissions: [{ permission: { name: 'admin:user:manage' } }] } });
    prisma.leadershipAssignment.findMany.mockResolvedValue([]);
    expect((await request(app).delete(`${base}/users/u2/roles/a1`).set(admin())).status).toBe(409);
    expect(prisma.leadershipAssignment.updateMany).not.toHaveBeenCalled();
  });

  test('revoke sessions', async () => {
    prisma.user.findFirst.mockResolvedValue(userRec());
    prisma.session.deleteMany.mockResolvedValue({ count: 3 });
    const res = await request(app).post(`${base}/users/u2/revoke-sessions`).set(admin());
    expect(res.body).toEqual({ revoked: 3 });
  });
});

describe('settings', () => {
  test('lists registry with defaults', async () => {
    const res = await request(app).get(`${base}/settings`).set(admin());
    expect(res.status).toBe(200);
    expect(res.body.map((s: any) => s.key)).toContain('events.absenceThreshold');
    expect(res.body.every((s: any) => s.isDefault)).toBe(true);
  });

  test('unknown key is 404', async () => {
    expect((await request(app).put(`${base}/settings/made.up`).set(admin()).send({ value: 1 })).status).toBe(404);
    expect(prisma.systemSetting.upsert).not.toHaveBeenCalled();
  });

  test.each([[1], [13], ['3'], [2.5], [null]])('invalid threshold %s is rejected', async (value) => {
    expect((await request(app).put(`${base}/settings/events.absenceThreshold`).set(admin()).send({ value })).status).toBe(400);
    expect(prisma.systemSetting.upsert).not.toHaveBeenCalled();
  });

  test('valid value is saved and audited', async () => {
    prisma.systemSetting.upsert.mockResolvedValue({});
    prisma.systemSetting.findMany.mockResolvedValue([{ key: 'events.absenceThreshold', value: 5, updatedAt: new Date(), updatedBy: 'member-1' }]);
    const res = await request(app).put(`${base}/settings/events.absenceThreshold`).set(admin()).send({ value: 5 });
    expect(res.status).toBe(200);
    expect(res.body.value).toBe(5);
    expect(prisma.systemSetting.upsert.mock.calls[0][0].where).toEqual({ churchId_key: { churchId: 'church-1', key: 'events.absenceThreshold' } });
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('SETTING_CHANGED');
  });

  test('reset deletes the stored value', async () => {
    prisma.systemSetting.deleteMany.mockResolvedValue({ count: 1 });
    expect((await request(app).delete(`${base}/settings/events.absenceThreshold`).set(admin())).status).toBe(200);
    expect(prisma.systemSetting.deleteMany).toHaveBeenCalledWith({ where: { churchId: 'church-1', key: 'events.absenceThreshold' } });
  });

  test('reader falls back to default when stored value is invalid', async () => {
    prisma.systemSetting.findUnique.mockResolvedValue({ value: 'garbage' });
    expect(await settingsReader.get('church-1', 'events.absenceThreshold')).toBe(3);
    prisma.systemSetting.findUnique.mockResolvedValue({ value: 6 });
    expect(await settingsReader.get('church-1', 'events.absenceThreshold')).toBe(6);
  });

  test('check-in window follows the settings', async () => {
    prisma.systemSetting.findUnique.mockImplementation((async ({ where }: any) =>
      where.churchId_key.key === 'events.checkInOpensHoursBefore' ? { value: 5 } : null) as never);
    const start = new Date('2026-05-01T10:00:00Z');
    const w = await checkInWindow('church-1', { startDateTime: start, endDateTime: new Date('2026-05-01T12:00:00Z') });
    expect(w.opens.toISOString()).toBe('2026-05-01T05:00:00.000Z');
    expect(w.closes.toISOString()).toBe('2026-05-01T14:00:00.000Z');
  });
});

describe('audit log', () => {
  const row = (over: Record<string, unknown> = {}) => ({ id: 'l1', churchId: 'church-1', action: 'X', entityType: 'E', entityId: 'e1', actorId: 'member-1', changes: '{}', reason: null, timestamp: new Date('2026-01-02T00:00:00Z'), ...over });

  test('list is church scoped with filters and actor names', async () => {
    prisma.auditLog.findMany.mockResolvedValue([row()]);
    prisma.auditLog.count.mockResolvedValue(1);
    prisma.member.findMany.mockResolvedValue([{ id: 'member-1', firstName: 'Jo', lastName: 'Sh', membershipNumber: 'M' }]);
    prisma.user.findMany.mockResolvedValue([]);
    const res = await request(app).get(`${base}/audit-logs?action=X&from=2026-01-01`).set(admin());
    expect(res.status).toBe(200);
    expect(prisma.auditLog.findMany.mock.calls[0][0].where).toMatchObject({ churchId: 'church-1', action: 'X' });
    expect(res.body.items[0].actorName).toBe('Jo Sh');
  });

  test('export needs a date range of at most a year', async () => {
    expect((await request(app).get(`${base}/audit-logs/export`).set(admin())).status).toBe(400);
    expect((await request(app).get(`${base}/audit-logs/export?from=2024-01-01&to=2026-01-01`).set(admin())).status).toBe(400);
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  test('export neutralises formulas, quotes commas and is itself audited', async () => {
    prisma.auditLog.findMany.mockResolvedValue([row({ action: '=HYPERLINK("x")', changes: 'a,b' })]);
    prisma.auditLog.count.mockResolvedValue(1);
    prisma.member.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
    const res = await request(app).get(`${base}/audit-logs/export?from=2026-01-01&to=2026-02-01`).set(admin());
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain(`"'=HYPERLINK(""x"")"`);
    expect(res.text).toContain('"a,b"');
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('AUDIT_LOG_EXPORTED');
  });
});

describe('retention', () => {
  test('lists every entity type with its floor', async () => {
    prisma.dataRetentionRule.findMany.mockResolvedValue([]);
    const res = await request(app).get(`${base}/retention`).set(admin());
    expect(res.body.map((r: any) => r.entityType)).toEqual(['AUDIT_LOG', 'REPORT_EXECUTION', 'SESSION', 'TOKEN']);
  });

  test('audit log cannot be kept less than 365 days; unknown entity rejected', async () => {
    expect((await request(app).put(`${base}/retention`).set(admin()).send({ entityType: 'AUDIT_LOG', retentionDays: 30 })).status).toBe(400);
    expect((await request(app).put(`${base}/retention`).set(admin()).send({ entityType: 'MEMBER', retentionDays: 900 })).status).toBe(400);
    expect(prisma.dataRetentionRule.upsert).not.toHaveBeenCalled();
  });

  test('saves a valid rule', async () => {
    prisma.dataRetentionRule.upsert.mockResolvedValue({ entityType: 'AUDIT_LOG' });
    expect((await request(app).put(`${base}/retention`).set(admin()).send({ entityType: 'AUDIT_LOG', retentionDays: 730 })).status).toBe(200);
  });

  test('a run without dryRun counts but never deletes', async () => {
    prisma.dataRetentionRule.findMany.mockResolvedValue([{ entityType: 'AUDIT_LOG', retentionDays: 400, isActive: true }]);
    prisma.auditLog.count.mockResolvedValue(7);
    const res = await request(app).post(`${base}/retention/run`).set(admin()).send({});
    expect(res.body).toMatchObject({ dryRun: true, results: [{ entityType: 'AUDIT_LOG', wouldRemove: 7 }] });
    expect(prisma.auditLog.deleteMany).not.toHaveBeenCalled();
  });

  test('explicit dryRun false deletes, scoped to the church, and records the run', async () => {
    prisma.dataRetentionRule.findMany.mockResolvedValue([{ entityType: 'AUDIT_LOG', retentionDays: 400, isActive: true }]);
    prisma.auditLog.deleteMany.mockResolvedValue({ count: 4 });
    prisma.dataRetentionRule.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app).post(`${base}/retention/run`).set(admin()).send({ dryRun: false });
    expect(res.body.results[0].removed).toBe(4);
    expect(prisma.auditLog.deleteMany.mock.calls[0][0].where.churchId).toBe('church-1');
    expect(prisma.dataRetentionRule.updateMany).toHaveBeenCalled();
  });

  test('floor is re-applied at run time to a rule written below it', async () => {
    prisma.dataRetentionRule.findMany.mockResolvedValue([{ entityType: 'AUDIT_LOG', retentionDays: 1, isActive: true }]);
    prisma.auditLog.count.mockResolvedValue(0);
    const res = await request(app).post(`${base}/retention/run`).set(admin()).send({});
    expect(res.body.results[0].retentionDays).toBe(365);
  });

  test('inactive rules are skipped', async () => {
    prisma.dataRetentionRule.findMany.mockResolvedValue([{ entityType: 'AUDIT_LOG', retentionDays: 400, isActive: false }]);
    const res = await request(app).post(`${base}/retention/run`).set(admin()).send({ dryRun: false });
    expect(res.body.results).toEqual([]);
    expect(prisma.auditLog.deleteMany).not.toHaveBeenCalled();
  });
});

describe('api reference', () => {
  test('lists real routes with their permissions', async () => {
    const res = await request(app).get(`${base}/api-reference`).set(admin());
    expect(res.status).toBe(200);
    const row = res.body.find((e: any) => e.method === 'POST' && e.path === '/api/v2/admin/users/:id/disable');
    expect(row).toMatchObject({ authenticated: true, permission: 'admin:user:manage', params: ['id'] });
  });

  test('openapi document is available outside production', async () => {
    const res = await request(app).get('/api/docs.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.3');
    expect(res.body.paths['/api/v2/admin/users/{id}/disable'].post['x-required-permission']).toBe('admin:user:manage');
  });
});

describe('disabled accounts cannot sign in', () => {
  test('login is refused with ACCOUNT_DISABLED', async () => {
    const bcrypt = await import('bcryptjs');
    prisma.user.findUnique.mockResolvedValue({
      id: 'u2', email: 'u2@example.com', passwordHash: await bcrypt.hash('Passw0rd!x', 4), churchId: 'church-1', memberId: 'member-2',
      disabledAt: new Date(), emailVerified: true, member: { firstName: 'A', lastName: 'B', archivedAt: null, leadershipAssignments: [] },
    });
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'u2@example.com', password: 'Passw0rd!x' });
    expect(res.status).toBe(403);
    expect(res.body.code ?? res.body.error?.code).toBe('ACCOUNT_DISABLED');
    expect(prisma.session.create).not.toHaveBeenCalled();
  });
});
