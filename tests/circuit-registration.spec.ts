import jwt from 'jsonwebtoken';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { createMockPrisma } from './helpers/mockPrisma';

const mocked = vi.hoisted(() => ({ prisma: undefined as unknown, send: undefined as unknown as ReturnType<typeof import('vitest').vi.fn> }));
vi.mock('@/services/email', async () => {
  const { vi: v } = await import('vitest');
  mocked.send = v.fn();
  return { emailService: { send: mocked.send } };
});
vi.mock('@/database', async () => {
  const { createMockPrisma: create } = await import('./helpers/mockPrisma');
  mocked.prisma = create();
  return { prisma: mocked.prisma, default: mocked.prisma };
});

import { createApp } from '@/app';
import { jwtSecret } from '@/config/secrets';

const prisma = mocked.prisma as ReturnType<typeof createMockPrisma>;
const app = createApp();
const as = (...permissions: string[]) => ({
  Authorization: `Bearer ${jwt.sign({ sub: 'user-1', email: 'u@example.com', churchId: 'church-1', memberId: 'member-1', permissions, sessionId: 's1', tokenId: 't1' }, jwtSecret, { expiresIn: '5m' })}`,
});

const district = { id: 'd1', conferenceId: 'c1', name: 'North', conference: { id: 'c1', name: 'Conf' } };
const row = (over: Record<string, unknown> = {}) => ({
  id: 'ci1', name: 'Central', location: 'Harare', identificationNumber: 'CIR-001', status: 'ACTIVE', registeredAt: new Date(), districtId: 'd1', district, ...over,
});
const body = {
  name: 'Central', conferenceId: 'c1', districtId: 'd1', location: 'Harare', identificationNumber: 'cir-001',
  firstChurch: { name: 'Central Main' }, secretary: { firstName: 'Ruth', lastName: 'Moyo', email: 'Ruth@Example.com' },
};
const post = (perms: string[] = ['circuit:register'], key?: string, data: object = body) => {
  const r = request(app).post('/api/v2/hierarchy/circuits').set(as(...perms));
  return (key ? r.set('Idempotency-Key', key) : r).send(data);
};

beforeEach(() => {
  vi.resetAllMocks();
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.auditLog.create.mockResolvedValue({});
  prisma.scopedRoleAssignment.findMany.mockResolvedValue([]);
  prisma.$transaction.mockImplementation((async (arg: unknown) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg as unknown[]))) as never);
  prisma.member.findFirst.mockResolvedValue(null);
  prisma.user.findUnique.mockResolvedValue(null);
  prisma.member.findMany.mockResolvedValue([]);
  prisma.church.create.mockResolvedValue({ id: 'ch1', name: 'Central Main' });
  prisma.role.create.mockResolvedValue({ id: 'role1' });
  prisma.permission.findMany.mockResolvedValue([{ id: 'p1' }]);
  prisma.rolePermission.createMany.mockResolvedValue({ count: 1 });
  prisma.member.create.mockResolvedValue({ id: 'mem1' });
  prisma.leadershipAssignment.create.mockResolvedValue({});
  prisma.invitation.create.mockResolvedValue({ id: 'inv1', expiresAt: new Date(Date.now() + 1000) });
});

describe('circuit registration', () => {
  test('needs sign-in and the circuit:register permission', async () => {
    expect((await request(app).post('/api/v2/hierarchy/circuits').send(body)).status).toBe(401);
    prisma.district.findUnique.mockResolvedValue(district);
    expect((await post([])).status).toBe(403);
    expect(prisma.circuit.create).not.toHaveBeenCalled();
  });

  test('registers a circuit, normalises the id number and audits it', async () => {
    prisma.district.findUnique.mockResolvedValue(district);
    prisma.circuit.findFirst.mockResolvedValue(null);
    prisma.circuit.create.mockResolvedValue(row());
    const res = await post();
    expect(res.status).toBe(201);
    expect(res.body.circuit).toMatchObject({ identificationNumber: 'CIR-001', conference: { id: 'c1' }, district: { id: 'd1' } });
    expect(prisma.circuit.create.mock.calls[0][0].data).toMatchObject({ identificationNumber: 'CIR-001', status: 'ACTIVE', registeredBy: 'user-1' });
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'CIRCUIT_REGISTERED', entityType: 'CIRCUIT' });
  });

  test('creates the first church, a finance-free Secretary role, the member and a grant-carrying invitation together', async () => {
    prisma.district.findUnique.mockResolvedValue(district);
    prisma.circuit.findFirst.mockResolvedValue(null);
    prisma.circuit.create.mockResolvedValue(row());
    const res = await post();
    expect(res.status).toBe(201);
    expect(res.body.secretaryInvitation).toMatchObject({ id: 'inv1', email: 'ruth@example.com' });
    expect(JSON.stringify(res.body)).not.toMatch(/token/i);
    expect(prisma.church.create.mock.calls[0][0].data).toMatchObject({ circuitId: 'ci1' });
    const names = prisma.permission.findMany.mock.calls[0][0].where.name.in as string[];
    expect(names).toContain('member:import');
    expect(names.filter((n) => /finance|journal|expenditure|access:|approve|payment/.test(n))).toEqual([]);
    expect(prisma.member.create.mock.calls[0][0].data).toMatchObject({ churchId: 'ch1', email: 'ruth@example.com' });
    expect(prisma.leadershipAssignment.create.mock.calls[0][0].data).toMatchObject({ churchId: 'ch1', memberId: 'mem1', roleId: 'role1' });
    expect(prisma.invitation.create.mock.calls[0][0].data).toMatchObject({ grantRoleId: 'role1', grantScopeType: 'CIRCUIT', grantScopeId: 'ci1', memberId: 'mem1' });
    expect(prisma.invitation.create.mock.calls[0][0].data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(mocked.send).toHaveBeenCalledTimes(1);
  });

  test('refuses a secretary email that already belongs to a member or account, and never half-creates', async () => {
    prisma.district.findUnique.mockResolvedValue(district);
    prisma.circuit.findFirst.mockResolvedValue(null);
    prisma.member.findFirst.mockResolvedValue({ id: 'someone' });
    expect((await post()).status).toBe(409);
    expect(prisma.circuit.create).not.toHaveBeenCalled();
  });

  test('a failure creating any part rolls the transaction back; a mail failure does not undo the registration', async () => {
    prisma.district.findUnique.mockResolvedValue(district);
    prisma.circuit.findFirst.mockResolvedValue(null);
    prisma.circuit.create.mockResolvedValue(row());
    prisma.invitation.create.mockRejectedValue(new Error('db down'));
    expect((await post()).status).toBe(500);
    expect(mocked.send).not.toHaveBeenCalled();
    prisma.invitation.create.mockResolvedValue({ id: 'inv1', expiresAt: new Date() });
    mocked.send.mockRejectedValueOnce(new Error('smtp'));
    expect((await post()).status).toBe(201);
  });

  test('requires a first church and a valid secretary', async () => {
    const { firstChurch, ...noChurch } = body;
    expect((await post(['circuit:register'], undefined, noChurch)).status).toBe(400);
    expect((await post(['circuit:register'], undefined, { ...body, secretary: { ...body.secretary, email: 'nope' } })).status).toBe(400);
  });

  test('resend re-issues the pending invitation with the same grant and revokes the old link', async () => {
    const pending = { id: 'inv1', churchId: 'ch1', email: 'ruth@example.com', memberId: 'mem1', grantRoleId: 'role1', grantScopeType: 'CIRCUIT', grantScopeId: 'ci1' };
    const resend = (perms: string[]) => request(app).post('/api/v2/hierarchy/circuits/ci1/secretary-invitation').set(as(...perms)).send();
    prisma.circuit.findUnique.mockResolvedValue({ districtId: 'd1' });
    prisma.district.findUnique.mockResolvedValue({ conferenceId: 'c1' });
    expect((await resend([])).status).toBe(404);
    prisma.invitation.findFirst.mockResolvedValue(null);
    expect((await resend(['circuit:register'])).status).toBe(409);
    prisma.invitation.findFirst.mockResolvedValue(pending);
    prisma.church.findUnique.mockResolvedValue({ name: 'Central Main' });
    prisma.invitation.updateMany.mockResolvedValue({ count: 1 });
    prisma.invitation.create.mockResolvedValue({ id: 'inv2', expiresAt: new Date() });
    expect((await resend(['circuit:register'])).status).toBe(200);
    expect(prisma.invitation.updateMany.mock.calls[0][0].where).toMatchObject({ id: 'inv1', acceptedAt: null, revokedAt: null });
    expect(prisma.invitation.create.mock.calls[0][0].data).toMatchObject({ grantRoleId: 'role1', grantScopeId: 'ci1' });
  });

  test('rejects a district that belongs to a different conference, server-side', async () => {
    prisma.district.findUnique.mockResolvedValue({ ...district, conferenceId: 'other' });
    const res = await post();
    expect(res.status).toBe(400);
    expect(prisma.circuit.create).not.toHaveBeenCalled();
  });

  test('rejects unknown district, bad payload and duplicates', async () => {
    prisma.district.findUnique.mockResolvedValue(null);
    expect((await post()).status).toBe(404);
    expect((await post(['circuit:register'], undefined, { ...body, identificationNumber: '!!' })).status).toBe(400);
    expect((await post(['circuit:register'], 'short')).status).toBe(400);

    prisma.district.findUnique.mockResolvedValue(district);
    prisma.circuit.findFirst.mockResolvedValue(row());
    expect((await post()).status).toBe(409);
    expect(prisma.circuit.create).not.toHaveBeenCalled();
  });

  test('a retry with the same idempotency key returns the first circuit and creates nothing', async () => {
    prisma.circuit.findUnique.mockResolvedValue(row());
    const res = await post(['circuit:register'], 'retry-key-123');
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(false);
    expect(prisma.circuit.create).not.toHaveBeenCalled();
    // Same key reused for a different circuit is refused rather than silently returning the wrong one.
    expect((await post(['circuit:register'], 'retry-key-123', { ...body, identificationNumber: 'CIR-999' })).status).toBe(409);
  });

  test('a concurrent double-submit that loses the unique-index race returns the winner', async () => {
    prisma.district.findUnique.mockResolvedValue(district);
    prisma.circuit.findFirst.mockResolvedValue(null);
    prisma.circuit.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(row());
    prisma.circuit.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }));
    const res = await post(['circuit:register'], 'race-key-1234');
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(false);
  });
});

describe('scoped authority over circuits', () => {
  const grant = (scopeType: string, scopeId: string, ...perms: string[]) => ({ scopeType, scopeId, role: { permissions: perms.map((name) => ({ permission: { name } })) } });

  test('a district grant registers circuits only inside that district', async () => {
    prisma.district.findUnique.mockResolvedValue(district); // chain: DISTRICT d1 -> CONFERENCE c1
    prisma.circuit.findFirst.mockResolvedValue(null);
    prisma.circuit.create.mockResolvedValue(row());
    prisma.scopedRoleAssignment.findMany.mockResolvedValue([grant('DISTRICT', 'd1', 'circuit:register')]);
    expect((await post([])).status).toBe(201);

    prisma.scopedRoleAssignment.findMany.mockResolvedValue([grant('DISTRICT', 'other-district', 'circuit:register')]);
    expect((await post([])).status).toBe(403);
    // Holding some other permission at the right scope is not enough.
    prisma.scopedRoleAssignment.findMany.mockResolvedValue([grant('DISTRICT', 'd1', 'circuit:view')]);
    expect((await post([])).status).toBe(403);
    // A conference grant covers its districts.
    prisma.scopedRoleAssignment.findMany.mockResolvedValue([grant('CONFERENCE', 'c1', 'circuit:register')]);
    expect((await post([])).status).toBe(201);
  });

  test('a scoped view grant lists only what it covers', async () => {
    prisma.circuit.findMany.mockResolvedValue([row()]);
    prisma.circuit.count.mockResolvedValue(1);
    prisma.scopedRoleAssignment.findMany.mockResolvedValue([grant('DISTRICT', 'd1', 'circuit:view'), grant('CIRCUIT', 'ci9', 'finance:view')]);
    await request(app).get('/api/v2/hierarchy/circuits').set(as());
    expect(prisma.circuit.findMany.mock.calls[0][0].where).toEqual({ OR: [{ districtId: 'd1' }] });
  });
});

describe('circuit listing and status', () => {
  test('without circuit:view:all a user only sees their own circuit', async () => {
    prisma.church.findUnique.mockResolvedValue({ circuitId: 'ci1' });
    prisma.circuit.findMany.mockResolvedValue([row()]);
    prisma.circuit.count.mockResolvedValue(1);
    const res = await request(app).get('/api/v2/hierarchy/circuits?districtId=other').set(as('circuit:view'));
    expect(res.body.total).toBe(1);
    expect(prisma.circuit.findMany.mock.calls[0][0].where).toEqual({ OR: [{ id: 'ci1' }] });
    prisma.circuit.findMany.mockClear();
    await request(app).get('/api/v2/hierarchy/circuits?districtId=d1').set(as('circuit:view', 'circuit:view:all'));
    expect(prisma.circuit.findMany.mock.calls[0][0].where).toEqual({ districtId: 'd1' });
    expect((await request(app).get('/api/v2/hierarchy/circuits').set(as())).status).toBe(403);
  });

  test('status moves follow the allowed transitions and use compare-and-set', async () => {
    const put = (status: string, perms = ['circuit:register']) => request(app).put('/api/v2/hierarchy/circuits/ci1/status').set(as(...perms)).send({ status });
    prisma.circuit.findUnique.mockResolvedValue(row());
    expect((await put('SUSPENDED', [])).status).toBe(404);
    prisma.circuit.findUnique.mockResolvedValue(row({ status: 'CLOSED' }));
    expect((await put('ACTIVE')).status).toBe(409);
    prisma.circuit.findUnique.mockResolvedValue(row());
    prisma.circuit.updateMany.mockResolvedValue({ count: 0 });
    expect((await put('SUSPENDED')).status).toBe(409);
    prisma.circuit.updateMany.mockResolvedValue({ count: 1 });
    const ok = await put('SUSPENDED');
    expect(ok.status).toBe(200);
    expect(prisma.circuit.updateMany.mock.calls[1][0].where).toEqual({ id: 'ci1', status: 'ACTIVE' });
  });
});
