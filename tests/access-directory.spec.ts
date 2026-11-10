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
const as = (...permissions: string[]) => ({
  Authorization: `Bearer ${jwt.sign({ sub: 'u1', email: 'u@example.com', churchId: 'church-1', memberId: 'm1', permissions, sessionId: 's1', tokenId: 't1' }, jwtSecret, { expiresIn: '5m' })}`,
});
const q = { scopeType: 'CIRCUIT', scopeId: 'cir-1' };
const grant = (...perms: string[]) => [{ scopeType: 'CIRCUIT', scopeId: 'cir-1', role: { permissions: perms.map((p) => ({ permission: { name: p } })) } }];

beforeEach(() => {
  vi.resetAllMocks();
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.auditLog.create.mockResolvedValue({});
  prisma.circuit.findUnique.mockResolvedValue({ districtId: 'd1' });
  prisma.district.findUnique.mockResolvedValue({ conferenceId: 'k1' });
  prisma.scopedRoleAssignment.findMany.mockResolvedValue([]);
});

describe('access directory lookups', () => {
  test('all three refuse a caller without access:assign at the scope', async () => {
    for (const path of ['assignments', 'assignable-roles', 'users']) {
      const res = await request(app).get(`/api/v2/access/${path}`).query({ ...q, q: 'abc' }).set(as('circuit:view'));
      expect(res.status, path).toBe(403);
    }
  });

  test('a grant on a different circuit gives nothing here', async () => {
    prisma.scopedRoleAssignment.findMany.mockResolvedValue([{ scopeType: 'CIRCUIT', scopeId: 'cir-9', role: { permissions: [{ permission: { name: 'access:assign' } }] } }]);
    expect((await request(app).get('/api/v2/access/assignments').query(q).set(as())).status).toBe(403);
  });

  test('user search needs three characters and returns no password data', async () => {
    prisma.scopedRoleAssignment.findMany.mockResolvedValue(grant('access:assign'));
    expect((await request(app).get('/api/v2/access/users').query({ ...q, q: 'ab' }).set(as())).status).toBe(400);
    prisma.church.findMany.mockResolvedValue([{ id: 'church-2' }]);
    prisma.user.findMany.mockResolvedValue([{ id: 'u2', email: 'a@b.org', member: { firstName: 'A', lastName: 'B' } }]);
    const res = await request(app).get('/api/v2/access/users').query({ ...q, q: 'a@b' }).set(as());
    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([{ id: 'u2', email: 'a@b.org', name: 'A B' }]);
    expect(prisma.user.findMany.mock.calls[0][0].where.id).toEqual({ not: 'u1' });
  });

  test('roles above the caller\'s own permissions are not offered', async () => {
    prisma.scopedRoleAssignment.findMany.mockResolvedValue(grant('access:assign', 'circuit:view'));
    prisma.church.findUnique.mockResolvedValue({ circuitId: 'cir-1' });
    prisma.role.findMany.mockResolvedValue([
      { id: 'r1', name: 'Viewer', church: { name: 'A' }, permissions: [{ permission: { name: 'circuit:view' } }] },
      { id: 'r2', name: 'Finance', church: { name: 'A' }, permissions: [{ permission: { name: 'finance:post' } }] },
    ]);
    const res = await request(app).get('/api/v2/access/assignable-roles').query(q).set(as());
    expect(res.body.roles.map((r: { id: string }) => r.id)).toEqual(['r1']);
  });

  test('the assignment list shows who holds what', async () => {
    prisma.scopedRoleAssignment.findMany.mockResolvedValueOnce(grant('access:assign')).mockResolvedValueOnce([{ id: 'a1', userId: 'u2', role: { id: 'r1', name: 'Viewer' }, sourceType: 'MANUAL', endsAt: null, createdAt: new Date() }]);
    prisma.user.findMany.mockResolvedValue([{ id: 'u2', email: 'x@y.org' }]);
    const res = await request(app).get('/api/v2/access/assignments').query(q).set(as());
    expect(res.status).toBe(200);
    expect(res.body.assignments[0]).toMatchObject({ id: 'a1', email: 'x@y.org', role: { name: 'Viewer' } });
  });
});
