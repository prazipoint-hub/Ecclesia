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
const as = (userId: string, ...permissions: string[]) => ({
  Authorization: `Bearer ${jwt.sign({ sub: userId, email: 'u@example.com', churchId: 'church-1', memberId: `m-${userId}`, permissions, sessionId: 's1', tokenId: 't1' }, jwtSecret, { expiresIn: '5m' })}`,
});
const base = '/api/v2/accounting/reconciliations';
const rec = (over: Record<string, unknown> = {}) => ({
  id: 'r1', churchId: 'church-1', currency: 'USD', periodStart: new Date('2026-03-01'), periodEnd: new Date('2026-03-31'),
  statementOpening: D(0), statementClosing: D(900), status: 'DRAFT', createdBy: 'u-a', completedBy: null, completedAt: null, notes: null, summaryJson: null, ...over,
});
const bl = (id: string, debit: number, credit: number, d = '2026-03-10') => ({ id, debit: D(debit), credit: D(credit), entry: { postDate: new Date(d), reference: `JE-${id}`, description: id } });
const sl = (id: string, amount: number, d = '2026-03-10') => ({ id, amount: D(amount), lineDate: new Date(d), status: 'UNMATCHED' });

beforeEach(() => {
  vi.resetAllMocks();
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.auditLog.create.mockResolvedValue({});
  prisma.$transaction.mockImplementation(async (fn: unknown) => (typeof fn === 'function' ? (fn as (tx: unknown) => unknown)(prisma) : fn));
  prisma.bankReconciliation.findUnique.mockResolvedValue(rec());
  prisma.ledgerAccount.findFirst.mockResolvedValue({ id: 'bank' });
});

/** Statement: +1000 matched earlier, -100 fee only on statement. Ledger: +1000 matched, +300 deposit in transit. Closing 900. */
const scenario = (closing = 900) => {
  prisma.bankReconciliation.findUnique.mockResolvedValue(rec({ statementClosing: D(closing) }));
  prisma.bankStatementLine.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => (where.matchedJournalLineId ? [{ matchedJournalLineId: 'A' }] : [sl('fee', -100)]));
  prisma.journalLine.findMany.mockResolvedValue([bl('A', 1000, 0), bl('B', 300, 0)]);
};

describe('bank reconciliation', () => {
  test('every mutation needs its own permission', async () => {
    expect((await request(app).post(base).set(as('u-a', 'finance:view')).send({})).status).toBe(403);
    expect((await request(app).post(`${base}/r1/complete`).set(as('u-b', 'finance:reconcile:manage')).send({})).status).toBe(403);
  });

  test('importing the same statement twice adds nothing the second time', async () => {
    prisma.bankStatementLine.createMany.mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 0 });
    const lines = [{ date: '2026-03-02', description: 'DEPOSIT', amount: 1000 }, { date: '2026-03-05', description: 'FEE', amount: -100 }];
    const first = await request(app).post(`${base}/r1/statement`).set(as('u-a', 'finance:reconcile:manage')).send({ lines });
    const second = await request(app).post(`${base}/r1/statement`).set(as('u-a', 'finance:reconcile:manage')).send({ lines });
    expect(first.body).toEqual({ submitted: 2, added: 2, duplicatesSkipped: 0 });
    expect(second.body.duplicatesSkipped).toBe(2);
    const hashes = prisma.bankStatementLine.createMany.mock.calls[0][0].data.map((d: { lineHash: string }) => d.lineHash);
    expect(new Set(hashes).size).toBe(2);
    expect(prisma.bankStatementLine.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });

  test('two identical lines in one file are kept as two lines', async () => {
    prisma.bankStatementLine.createMany.mockResolvedValue({ count: 2 });
    const l = { date: '2026-03-02', description: 'CASH DEP', amount: 50 };
    await request(app).post(`${base}/r1/statement`).set(as('u-a', 'finance:reconcile:manage')).send({ lines: [l, l] });
    const hashes = prisma.bankStatementLine.createMany.mock.calls[0][0].data.map((d: { lineHash: string }) => d.lineHash);
    expect(new Set(hashes).size).toBe(2);
  });

  test('a match needs identical amounts', async () => {
    prisma.bankStatementLine.findFirst.mockResolvedValue({ id: 'l1', amount: D(100) });
    prisma.journalLine.findFirst.mockResolvedValue(bl('B', 99, 0));
    const res = await request(app).post(`${base}/r1/match`).set(as('u-a', 'finance:reconcile:manage')).send({ lineId: 'l1', journalLineId: 'B' });
    expect(res.status).toBe(409);
    expect(prisma.bankStatementLine.updateMany).not.toHaveBeenCalled();
  });

  test('a ledger line already matched elsewhere is refused', async () => {
    prisma.bankStatementLine.findFirst.mockResolvedValue({ id: 'l1', amount: D(100) });
    prisma.journalLine.findFirst.mockResolvedValue(bl('B', 100, 0));
    prisma.bankStatementLine.updateMany.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    const res = await request(app).post(`${base}/r1/match`).set(as('u-a', 'finance:reconcile:manage')).send({ lineId: 'l1', journalLineId: 'B' });
    expect(res.status).toBe(409);
  });

  test('a ledger line from a non-bank account or another church cannot be matched', async () => {
    prisma.bankStatementLine.findFirst.mockResolvedValue({ id: 'l1', amount: D(100) });
    prisma.journalLine.findFirst.mockResolvedValue(null);
    expect((await request(app).post(`${base}/r1/match`).set(as('u-a', 'finance:reconcile:manage')).send({ lineId: 'l1', journalLineId: 'X' })).status).toBe(404);
    const where = prisma.journalLine.findFirst.mock.calls[0][0].where;
    expect(where.accountId).toBe('bank');
    expect(where.entry.churchId).toBe('church-1');
  });

  test('the summary treats a deposit in transit and a bank-only fee as reconciling items', async () => {
    scenario();
    const res = await request(app).get(`${base}/r1`).set(as('u-a', 'finance:view'));
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ ledgerBalance: '1300.00', unmatchedLedgerNet: '300.00', unmatchedStatementNet: '-100.00', adjustedBank: '1200.00', adjustedBook: '1200.00', difference: '0.00' });
  });

  test('the person who started it cannot complete it', async () => {
    scenario();
    expect((await request(app).post(`${base}/r1/complete`).set(as('u-a', 'finance:reconcile:complete'))).status).toBe(403);
  });

  test('it will not complete while there is a difference', async () => {
    scenario(850);
    const res = await request(app).post(`${base}/r1/complete`).set(as('u-b', 'finance:reconcile:complete'));
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/does not balance/);
    expect(prisma.bankReconciliation.updateMany).not.toHaveBeenCalled();
  });

  test('a second person completes a balanced reconciliation once, and it freezes', async () => {
    scenario();
    prisma.bankReconciliation.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const ok = await request(app).post(`${base}/r1/complete`).set(as('u-b', 'finance:reconcile:complete'));
    expect(ok.status).toBe(200);
    expect(prisma.bankReconciliation.updateMany.mock.calls[0][0].where.status).toBe('DRAFT');
    expect(JSON.parse(prisma.bankReconciliation.updateMany.mock.calls[0][0].data.summaryJson).difference).toBe('0.00');
    const lost = await request(app).post(`${base}/r1/complete`).set(as('u-c', 'finance:reconcile:complete'));
    expect(lost.status).toBe(409);
  });

  test('a completed reconciliation accepts no further changes', async () => {
    prisma.bankReconciliation.findUnique.mockResolvedValue(rec({ status: 'COMPLETED' }));
    expect((await request(app).post(`${base}/r1/statement`).set(as('u-a', 'finance:reconcile:manage')).send({ lines: [{ date: '2026-03-02', description: 'x', amount: 1 }] })).status).toBe(409);
    expect((await request(app).post(`${base}/r1/auto-match`).set(as('u-a', 'finance:reconcile:manage'))).status).toBe(409);
  });

  test('another church\'s reconciliation looks missing', async () => {
    prisma.bankReconciliation.findUnique.mockResolvedValue(rec({ churchId: 'other' }));
    expect((await request(app).get(`${base}/r1`).set(as('u-a', 'finance:view'))).status).toBe(404);
  });

  test('auto-match claims only unambiguous pairs', async () => {
    prisma.bankStatementLine.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => (where.matchedJournalLineId ? [] : [sl('s1', 100), sl('s2', 100), sl('s3', 70)]));
    prisma.journalLine.findMany.mockResolvedValue([bl('b1', 100, 0), bl('b3', 70, 0)]);
    prisma.bankStatementLine.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app).post(`${base}/r1/auto-match`).set(as('u-a', 'finance:reconcile:manage'));
    expect(res.body.matched).toBe(1); // s3<->b3 only; s1/s2 compete for b1
    expect(prisma.bankStatementLine.updateMany.mock.calls[0][0].where.id).toBe('s3');
  });
});
