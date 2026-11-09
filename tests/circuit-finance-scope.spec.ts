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
const MINE = 'circuit-mine';
const OTHER = 'circuit-other';
const as = (...permissions: string[]) => ({
  Authorization: `Bearer ${jwt.sign({ sub: 'u1', email: 'u@example.com', churchId: 'church-1', memberId: null, permissions, sessionId: 's1', tokenId: 't1' }, jwtSecret, { expiresIn: '5m' })}`,
});
const grant = (scopeId: string, ...perms: string[]) => [{ scopeType: 'CIRCUIT', scopeId, role: { permissions: perms.map((name) => ({ permission: { name } })) } }];

beforeEach(() => {
  vi.resetAllMocks();
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.auditLog.create.mockResolvedValue({});
  prisma.church.findUnique.mockResolvedValue({ circuitId: MINE });
  prisma.scopedRoleAssignment.findMany.mockResolvedValue([]);
  prisma.circuit.findUnique.mockImplementation((async ({ where }: { where: { id: string } }) => ({ id: where.id, districtId: null })) as never);
  prisma.circuitFinancialAccount.findUnique.mockResolvedValue({ openingBalance: 0 });
  for (const m of [prisma.circuitReceipt, prisma.circuitExpenditure]) { m.aggregate.mockResolvedValue({ _sum: { amount: 0 } }); m.findMany.mockResolvedValue([]); m.count.mockResolvedValue(0); }
});

describe('circuit finance is bound to the caller’s circuit', () => {
  test('token permission works for the user’s own circuit', async () => {
    expect((await request(app).get(`/api/v2/circuits/${MINE}/dashboard`).set(as('circuit_finance:view'))).status).not.toBe(403);
  });

  test('token permission does NOT open another circuit', async () => {
    const res = await request(app).get(`/api/v2/circuits/${OTHER}/dashboard`).set(as('circuit_finance:view'));
    expect(res.status).toBe(403);
    expect(prisma.circuitReceipt.aggregate).not.toHaveBeenCalled();
  });

  test('a scoped grant opens the circuit it covers, without the token permission', async () => {
    prisma.scopedRoleAssignment.findMany.mockResolvedValue(grant(OTHER, 'circuit_finance:view'));
    expect((await request(app).get(`/api/v2/circuits/${OTHER}/dashboard`).set(as())).status).not.toBe(403);
  });

  test('a scoped grant for one circuit does not open a different one', async () => {
    prisma.scopedRoleAssignment.findMany.mockResolvedValue(grant(MINE, 'circuit_finance:view'));
    expect((await request(app).get(`/api/v2/circuits/${OTHER}/dashboard`).set(as())).status).toBe(403);
  });

  test('no token permission and no grant is refused at the route', async () => {
    expect((await request(app).get(`/api/v2/circuits/${MINE}/dashboard`).set(as())).status).toBe(403);
  });
});
