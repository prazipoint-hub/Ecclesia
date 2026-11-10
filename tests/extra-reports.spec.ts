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
const run = (reportType: string, perms: string[], parameters: Record<string, unknown> = {}) =>
  request(app).post('/api/v2/reports/run').set(as(...perms)).send({ reportType, format: 'JSON', parameters });

beforeEach(() => {
  vi.resetAllMocks();
  prisma.profileFieldDefinition.findMany.mockResolvedValue([]);
  prisma.profileFieldValue.findMany.mockResolvedValue([]);
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.auditLog.create.mockResolvedValue({});
  prisma.systemSetting.findUnique.mockResolvedValue(null);
  prisma.reportExecution.create.mockResolvedValue({ id: 'x1' });
  prisma.reportExecution.update.mockResolvedValue({});
});

describe('new report types', () => {
  test('each needs its own permission', async () => {
    for (const t of ['PROFILE_COMPLETION', 'LEADERSHIP_REGISTER_ASOF', 'MEMBERSHIP_DISTINCT', 'CASH_SESSIONS', 'DEPOSITS', 'TREASURER_OVERVIEW']) {
      expect((await run(t, [], { period: 'THIS_YEAR' })).status, t).toBe(403);
    }
  });

  test('profile completion returns counts only', async () => {
    prisma.member.findMany.mockResolvedValue([{ firstName: 'A', lastName: 'B', phone: '0771234567', gender: 'MALE', address: 'x', dateOfBirth: null, nextOfKin: null }]);
    const res = await run('PROFILE_COMPLETION', ['member:profile:report']);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('0771234567');
    expect(JSON.stringify(res.body)).toContain('MISSING_NEXTOFKIN');
  });

  test('leadership register as at a past date asks for appointments effective then', async () => {
    prisma.appointment.findMany.mockResolvedValue([]);
    prisma.appointment.count.mockResolvedValue(0);
    const res = await run('LEADERSHIP_REGISTER_ASOF', ['leadership:appointment:view'], { startDate: '2025-01-01', endDate: '2025-06-30' });
    expect(res.status).toBe(200);
    const where = prisma.appointment.findMany.mock.calls[0][0].where;
    expect(where.termStart.lte.toISOString().slice(0, 10)).toBe('2025-06-30');
    expect(where.OR).toEqual([{ termEnd: null }, { termEnd: { gt: where.termStart.lte } }]);
  });

  test('cash sessions report flags discrepancies from stored counts', async () => {
    prisma.cashSession.findMany.mockResolvedValue([
      { id: 'a', sessionDate: new Date('2026-03-01'), status: 'RECONCILED', handledBy: 'm9', currency: 'USD', snapshotJson: JSON.stringify({ cashReceipts: { USD: '100.00' }, expected: { USD: '100.00' } }), countsJson: JSON.stringify({ variances: { USD: '-5.00' } }), submissionNo: 1, submittedAt: null, reviewedBy: 'u2', reviewedAt: null },
      { id: 'b', sessionDate: new Date('2026-03-02'), status: 'OPEN', handledBy: 'm9', currency: 'USD', snapshotJson: null, countsJson: null, submissionNo: 0, submittedAt: null, reviewedBy: null, reviewedAt: null },
    ]);
    const res = await run('CASH_SESSIONS', ['finance:cash_session:review'], { startDate: '2026-03-01', endDate: '2026-03-31' });
    expect(res.status).toBe(200);
    expect(res.body.data.map((r: { discrepancy: boolean }) => r.discrepancy)).toEqual([true, false]);
  });

  test('treasurer overview keeps currencies and approved/pending apart', async () => {
    prisma.cashSession.findMany.mockResolvedValue([{ id: 's1', status: 'RECONCILED', snapshotJson: JSON.stringify({ cashReceipts: { USD: '50.00', ZWG: '10.00' } }), sessionDate: new Date() }]);
    prisma.deposit.findMany.mockResolvedValue([]);
    prisma.fund.findMany.mockResolvedValue([]);
    prisma.receipt.groupBy.mockResolvedValue([]);
    prisma.expenditure.groupBy.mockResolvedValue([]);
    const res = await run('TREASURER_OVERVIEW', ['finance:view']);
    expect(res.status).toBe(200);
    const rows = res.body.data as Array<{ measure: string; currency: string; amount: string }>;
    expect(rows.filter((r) => r.measure === 'APPROVED_CASH').map((r) => `${r.currency}:${r.amount}`).sort()).toEqual(['USD:50.00', 'ZWG:10.00']);
    expect(rows.some((r) => r.measure === 'PENDING_CASH')).toBe(false);
  });

  test('distinct membership counts a person once; organisation counts are labelled as overlapping', async () => {
    prisma.member.count.mockResolvedValue(120);
    prisma.member.groupBy.mockResolvedValue([{ sectionId: 's1', _count: { _all: 70 } }, { sectionId: null, _count: { _all: 50 } }]);
    prisma.organizationMembership.groupBy.mockResolvedValue([{ organizationId: 'o1', _count: { memberId: 90 } }]);
    const res = await run('MEMBERSHIP_DISTINCT', ['report:view:administrative']);
    expect(res.status).toBe(200);
    const rows = res.body.data as Array<{ measure: string; value: number }>;
    expect(rows.find((r) => r.measure === 'DISTINCT_ACTIVE_MEMBERS')!.value).toBe(120);
    expect(rows.find((r) => r.measure === 'ORGANISATION_MEMBERSHIPS_OVERLAP_ALLOWED')!.value).toBe(90);
    const where = prisma.organizationMembership.groupBy.mock.calls[0][0].where;
    expect(where).toMatchObject({ membershipStatus: 'ACTIVE', endedAt: null });
  });

  test('every extra report run is audited', async () => {
    prisma.member.findMany.mockResolvedValue([]);
    await run('PROFILE_COMPLETION', ['member:profile:report']);
    expect(prisma.auditLog.create.mock.calls.some((c) => c[0].data.action === 'REPORT_GENERATED')).toBe(true);
  });

  test('section audit evidence lists records with exception flags and stays inside the church', async () => {
    const res0 = await run('SECTION_AUDIT_EVIDENCE', ['report:view:section_finance'], { period: 'THIS_YEAR' });
    expect(res0.status).toBe(400); // no section chosen
    prisma.section.findUnique.mockResolvedValue({ churchId: 'other', name: 'X' });
    expect((await run('SECTION_AUDIT_EVIDENCE', ['report:view:section_finance'], { period: 'THIS_YEAR', sectionId: 's1' })).status).toBe(404);
    prisma.section.findUnique.mockResolvedValue({ churchId: 'church-1', name: 'Youth' });
    prisma.sectionReceipt.findMany.mockResolvedValue([{ receiptNumber: 'SEC-1', issuedAt: new Date('2026-02-01'), amount: D(20), currency: 'USD', paymentMethod: 'CASH', status: 'ISSUED', issuedBy: 'u9' }]);
    prisma.sectionExpenditure.findMany.mockResolvedValue([
      { id: 'x1', requestedAt: new Date('2026-02-02'), amount: D(50), status: 'PAID', requestedBy: 'u5', approvedBy: 'u5', approvedAt: new Date('2026-02-03'), paidAt: new Date('2026-02-04'), purpose: 'Tent', paymentMethod: 'CASH', attachments: null },
    ]);
    prisma.expenditureApproval.groupBy.mockResolvedValue([{ expenditureId: 'x1', _count: { _all: 1 } }]);
    const res = await run('SECTION_AUDIT_EVIDENCE', ['report:view:section_finance'], { period: 'THIS_YEAR', sectionId: 's1' });
    expect(res.status).toBe(200);
    const rows = res.body.data ?? res.body.report?.data ?? res.body;
    const text = JSON.stringify(rows);
    expect(text).toContain('NO_SUPPORTING_DOCUMENT');
    expect(text).toContain('REQUESTER_APPROVED_OWN');
    expect(text).toContain('1 receipts, 1 expenditures, 1 with exceptions');
  });
});
