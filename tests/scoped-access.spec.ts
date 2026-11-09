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

const prisma = mocked.prisma as ReturnType<typeof createMockPrisma>;
const app = createApp();
const as = (userId: string, ...permissions: string[]) => ({
  Authorization: `Bearer ${jwt.sign({ sub: userId, email: 'u@example.com', churchId: 'church-1', memberId: 'm1', permissions, sessionId: 's1', tokenId: 't1' }, jwtSecret, { expiresIn: '5m' })}`,
});
const grant = (scopeType: string, scopeId: string, ...perms: string[]) => ({ scopeType, scopeId, role: { permissions: perms.map((name) => ({ permission: { name } })) } });

// church-a (role home) -> circuit ci1 -> district d1 -> conference c1
const world = () => {
  prisma.church.findUnique.mockImplementation((async ({ where }: { where: { id: string } }) => (where.id === 'church-a' ? { circuitId: 'ci1' } : null)) as never);
  prisma.circuit.findUnique.mockResolvedValue({ districtId: 'd1' });
  prisma.district.findUnique.mockResolvedValue({ conferenceId: 'c1' });
  prisma.conference.findUnique.mockResolvedValue({ id: 'c1' });
};
const role = (...perms: string[]) => ({ id: 'r1', churchId: 'church-a', permissions: perms.map((name) => ({ permission: { name } })) });
const body = { userId: 'target', roleId: 'r1', scopeType: 'CIRCUIT', scopeId: 'ci1' };
const assign = (actor: string, perms: string[], data: object = body) => request(app).post('/api/v2/access/assignments').set(as(actor, ...perms)).send(data);

beforeEach(() => {
  vi.resetAllMocks();
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.auditLog.create.mockResolvedValue({});
  prisma.scopedRoleAssignment.findMany.mockResolvedValue([]);
  prisma.scopedRoleAssignment.findFirst.mockResolvedValue(null);
  prisma.scopedRoleAssignment.create.mockImplementation((async ({ data }: { data: object }) => ({ id: 'a1', ...data })) as never);
  prisma.user.findUnique.mockResolvedValue({ id: 'target', disabledAt: null });
  world();
});

describe('assigning scoped roles', () => {
  test('needs access:assign at the scope; unrelated or lower grants do not count', async () => {
    prisma.role.findUnique.mockResolvedValue(role('member:view'));
    expect((await assign('boss', [])).status).toBe(403);
    prisma.scopedRoleAssignment.findMany.mockResolvedValue([grant('CIRCUIT', 'other', 'access:assign', 'member:view')]);
    expect((await assign('boss', [])).status).toBe(403);
    // Church-level grant is BELOW the circuit, so it must not allow assigning at the circuit.
    prisma.scopedRoleAssignment.findMany.mockResolvedValue([grant('CHURCH', 'church-a', 'access:assign', 'member:view')]);
    expect((await assign('boss', [])).status).toBe(403);
    expect(prisma.scopedRoleAssignment.create).not.toHaveBeenCalled();
  });

  test('a covering grant (circuit, district or conference) lets the holder assign, and the assignment is audited', async () => {
    prisma.role.findUnique.mockResolvedValue(role('member:view'));
    for (const g of [grant('CIRCUIT', 'ci1', 'access:assign', 'member:view'), grant('DISTRICT', 'd1', 'access:assign', 'member:view'), grant('CONFERENCE', 'c1', 'access:assign', 'member:view')]) {
      prisma.scopedRoleAssignment.findMany.mockResolvedValue([g]);
      const res = await assign('boss', []);
      expect(res.status).toBe(201);
    }
    expect(prisma.scopedRoleAssignment.create.mock.calls[0][0].data).toMatchObject({ userId: 'target', roleId: 'r1', scopeType: 'CIRCUIT', scopeId: 'ci1', sourceType: 'MANUAL', createdBy: 'boss' });
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('SCOPED_ROLE_ASSIGNED');
  });

  test('cannot grant permissions the assigner does not hold (no escalation)', async () => {
    prisma.role.findUnique.mockResolvedValue(role('member:view', 'finance:journal:approve'));
    prisma.scopedRoleAssignment.findMany.mockResolvedValue([grant('CIRCUIT', 'ci1', 'access:assign', 'member:view')]);
    const res = await assign('boss', []);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('finance:journal:approve');
  });

  test('cannot assign to yourself, to a missing or disabled user, or with a role from outside the scope', async () => {
    prisma.role.findUnique.mockResolvedValue(role('member:view'));
    prisma.scopedRoleAssignment.findMany.mockResolvedValue([grant('CIRCUIT', 'ci1', 'access:assign', 'member:view')]);
    expect((await assign('target', [])).status).toBe(403);
    prisma.user.findUnique.mockResolvedValue({ id: 'target', disabledAt: new Date() });
    expect((await assign('boss', [])).status).toBe(404);
    prisma.user.findUnique.mockResolvedValue({ id: 'target', disabledAt: null });
    prisma.role.findUnique.mockResolvedValue({ ...role('member:view'), churchId: 'church-elsewhere' }); // chain lookup returns null -> not in scope
    expect((await assign('boss', [])).status).toBe(400);
    expect((await assign('boss', [], { ...body, scopeId: '' })).status).toBe(400);
    expect(prisma.scopedRoleAssignment.create).not.toHaveBeenCalled();
  });

  test('rejects bad dates and is idempotent for an identical live grant', async () => {
    prisma.role.findUnique.mockResolvedValue(role('member:view'));
    prisma.scopedRoleAssignment.findMany.mockResolvedValue([grant('CIRCUIT', 'ci1', 'access:assign', 'member:view')]);
    expect((await assign('boss', [], { ...body, endsAt: '2000-01-01' })).status).toBe(400);
    prisma.scopedRoleAssignment.findFirst.mockResolvedValue({ id: 'existing' });
    const res = await assign('boss', []);
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(false);
    expect(prisma.scopedRoleAssignment.create).not.toHaveBeenCalled();
  });

  test('the global grant skips the scope-holding and subset checks (bootstrap), but still not self-assignment', async () => {
    prisma.role.findUnique.mockResolvedValue(role('finance:journal:approve'));
    expect((await assign('root', ['access:assign:global'])).status).toBe(201);
    expect((await assign('target', ['access:assign:global'])).status).toBe(403);
  });
});

describe('revoking and contexts', () => {
  test('revoke is compare-and-set, scoped, and cannot be done by outsiders or on yourself', async () => {
    const row = { id: 'a1', userId: 'target', roleId: 'r1', scopeType: 'CIRCUIT', scopeId: 'ci1' };
    prisma.scopedRoleAssignment.findUnique.mockResolvedValue(row);
    const del = (actor: string) => request(app).delete('/api/v2/access/assignments/a1').set(as(actor)).send({ reason: 'term ended' });
    expect((await del('stranger')).status).toBe(404);
    prisma.scopedRoleAssignment.findMany.mockResolvedValue([grant('DISTRICT', 'd1', 'access:assign')]);
    prisma.scopedRoleAssignment.updateMany.mockResolvedValue({ count: 0 });
    expect((await del('boss')).status).toBe(409);
    prisma.scopedRoleAssignment.updateMany.mockResolvedValue({ count: 1 });
    expect((await del('boss')).status).toBe(200);
    expect(prisma.scopedRoleAssignment.updateMany.mock.calls[1][0].where).toEqual({ id: 'a1', revokedAt: null });
    expect(prisma.auditLog.create.mock.calls.at(-1)![0].data.action).toBe('SCOPED_ROLE_REVOKED');
    expect((await del('target')).status).toBe(403);
  });

  test('active-grant query excludes revoked, future and expired grants', async () => {
    prisma.scopedRoleAssignment.findMany.mockResolvedValue([]);
    await request(app).get('/api/v2/access/me/contexts').set(as('u1'));
    const where = prisma.scopedRoleAssignment.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ userId: 'u1', revokedAt: null });
    expect(where.startsAt.lte).toBeInstanceOf(Date);
    expect(where.OR).toEqual([{ endsAt: null }, { endsAt: { gt: expect.any(Date) } }]);
  });
});
