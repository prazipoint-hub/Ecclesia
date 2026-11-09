import jwt from 'jsonwebtoken';
import request from 'supertest';
import { Prisma } from '@prisma/client';
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
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const as = (...permissions: string[]) => ({
  Authorization: `Bearer ${jwt.sign({ sub: 'u1', email: 'u@example.com', churchId: 'church-1', memberId: 'm1', permissions, sessionId: 's1', tokenId: 't1' }, jwtSecret, { expiresIn: '5m' })}`,
});
const get = (q: Record<string, string>, ...perms: string[]) => request(app).get('/api/v2/reports/hierarchy').query(q).set(as(...perms));
const base = { kind: 'INCOME', scopeType: 'CIRCUIT', scopeId: 'cir-1', from: '2026-01-01', to: '2026-06-30' };

beforeEach(() => {
  vi.resetAllMocks();
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.auditLog.create.mockResolvedValue({});
  // The caller's church sits in circuit cir-1 only.
  prisma.church.findUnique.mockResolvedValue({ circuitId: 'cir-1' });
  prisma.circuit.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => (where.id === 'cir-1' || where.id === 'cir-2' ? { districtId: 'd1', name: `Circuit ${where.id}` } : null));
  prisma.district.findUnique.mockResolvedValue({ conferenceId: 'conf-1', name: 'District' });
  prisma.scopedRoleAssignment.findMany.mockResolvedValue([]);
  prisma.church.findMany.mockResolvedValue([{ id: 'church-1', name: 'Alpha' }, { id: 'church-3', name: 'Beta' }]);
});

describe('hierarchy reports', () => {
  test('refuses a caller without the permission', async () => {
    expect((await get(base)).status).toBe(403);
  });

  test('the token permission works only for the caller\'s own circuit', async () => {
    const res = await get({ ...base, scopeId: 'cir-2' }, 'report:view:hierarchy');
    expect(res.status).toBe(403);
    expect(prisma.receipt.groupBy).not.toHaveBeenCalled();
  });

  test('income rolls up per currency and never adds currencies together', async () => {
    prisma.receipt.groupBy.mockResolvedValue([
      { churchId: 'church-1', currency: 'USD', _sum: { amount: D('100.10') }, _count: { _all: 2 } },
      { churchId: 'church-3', currency: 'USD', _sum: { amount: D('50') }, _count: { _all: 1 } },
      { churchId: 'church-3', currency: 'ZWL', _sum: { amount: D('9000') }, _count: { _all: 3 } },
    ]);
    const res = await get(base, 'report:view:hierarchy');
    expect(res.status).toBe(200);
    const totals = res.body.rows.filter((r: { church: string }) => r.church === 'TOTAL');
    expect(totals).toEqual([{ church: 'TOTAL', currency: 'USD', amount: '150.10', count: 3 }, { church: 'TOTAL', currency: 'ZWL', amount: '9000.00', count: 3 }]);
    expect(prisma.receipt.groupBy.mock.calls[0][0].where.status).toBe('ISSUED');
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  test('a scoped grant lets a user from another circuit read this one', async () => {
    prisma.church.findUnique.mockResolvedValue({ circuitId: 'cir-9' });
    prisma.scopedRoleAssignment.findMany.mockResolvedValue([{ scopeType: 'CIRCUIT', scopeId: 'cir-1', role: { permissions: [{ permission: { name: 'report:view:hierarchy' } }] } }]);
    prisma.member.groupBy.mockResolvedValue([{ churchId: 'church-1', _count: { _all: 7 } }]);
    const res = await get({ kind: 'MEMBERSHIP', scopeType: 'CIRCUIT', scopeId: 'cir-1' });
    expect(res.status).toBe(200);
    expect(res.body.rows).toEqual([{ church: 'Alpha', activeMembers: 7 }, { church: 'Beta', activeMembers: 0 }, { church: 'TOTAL', activeMembers: 7 }]);
  });

  test('dates are required for money and attendance, and validated', async () => {
    expect((await get({ ...base, from: '', to: '' }, 'report:view:hierarchy')).status).toBe(400);
    expect((await get({ ...base, from: '2026-07-01', to: '2026-01-01' }, 'report:view:hierarchy')).status).toBe(400);
  });

  test('attendance counts present people per church', async () => {
    prisma.event.findMany.mockResolvedValue([{ churchId: 'church-1', _count: { attendances: 30 } }, { churchId: 'church-1', _count: { attendances: 20 } }]);
    const res = await get({ ...base, kind: 'ATTENDANCE' }, 'report:view:hierarchy');
    expect(res.status).toBe(200);
    expect(res.body.rows[res.body.rows.length - 1]).toEqual({ church: 'TOTAL', events: 2, present: 50 });
  });
});
