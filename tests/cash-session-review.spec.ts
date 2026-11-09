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
const as = (userId: string, memberId: string | null, ...permissions: string[]) => ({
  Authorization: `Bearer ${jwt.sign({ sub: userId, email: 'u@example.com', churchId: 'church-1', memberId, permissions, sessionId: 's1', tokenId: 't1' }, jwtSecret, { expiresIn: '5m' })}`,
});
const CASHIER = () => as('u-cash', 'm-cash', 'finance:cash_session:manage');
const REVIEWER = (userId = 'u-rev', memberId: string | null = 'm-rev') => as(userId, memberId, 'finance:cash_session:review');
const base = '/api/v2/accounting/cash-sessions';

const session = (over: Record<string, unknown> = {}) => ({
  id: 'cs1', churchId: 'church-1', accountId: 'fa', status: 'OPEN', currency: 'USD', sessionDate: new Date('2026-03-01T08:00:00Z'), handledBy: 'm-cash',
  openingBalance: D(100), submissionNo: 0, submittedBy: null, submittedAt: null, countsJson: null, snapshotJson: null, reviewNote: null, ...over,
});
// 150 USD cash + 40 USD mobile + 30 ZWG cash, in two income types.
const groups = [
  { currency: 'USD', paymentMethod: 'CASH', incomeType: 'OFFERING', _sum: { amount: D(100) }, _count: { _all: 4 } },
  { currency: 'USD', paymentMethod: 'CASH', incomeType: 'TITHE', _sum: { amount: D(50) }, _count: { _all: 2 } },
  { currency: 'USD', paymentMethod: 'MOBILE_MONEY', incomeType: 'OFFERING', _sum: { amount: D(40) }, _count: { _all: 1 } },
  { currency: 'ZWG', paymentMethod: 'CASH', incomeType: 'OFFERING', _sum: { amount: D(30) }, _count: { _all: 1 } },
];
const submitBody = (over: Record<string, unknown> = {}) => ({ counts: [{ currency: 'USD', counted: 250 }, { currency: 'ZWG', counted: 30 }], cashPaidOut: 0, ...over });

beforeEach(() => {
  vi.resetAllMocks();
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.auditLog.create.mockResolvedValue({});
  prisma.$transaction.mockImplementation((async (arg: unknown) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg as unknown[]))) as never);
  prisma.cashSession.findUnique.mockResolvedValue(session());
  prisma.receipt.groupBy.mockResolvedValue(groups);
  prisma.cashSession.updateMany.mockResolvedValue({ count: 1 });
  prisma.cashSession.update.mockResolvedValue({});
  prisma.cashSessionEvent.create.mockResolvedValue({});
});

describe('submitting a session', () => {
  const submit = (body: object, auth = CASHIER()) => request(app).post(`${base}/cs1/submit`).set(auth).send(body);

  test('server computes expected cash per currency (float + CASH only - payouts), never adding currencies', async () => {
    const res = await submit(submitBody());
    expect(res.status).toBe(200);
    expect(res.body.snapshot.expected).toEqual({ USD: '250.00', ZWG: '30.00' }); // 100 float + 150 cash; the 40 mobile payment is excluded
    expect(res.body.snapshot.other).toEqual({ 'MOBILE_MONEY:USD': '40.00' });
    expect(res.body.snapshot.categories['OFFERING:USD']).toBe('140.00');
    expect(res.body.variances).toEqual({ USD: '0.00', ZWG: '0.00' });
    expect(prisma.receipt.groupBy.mock.calls[0][0].where).toEqual({ cashSessionId: 'cs1', status: 'ISSUED' });
  });

  test('payouts reduce expected cash in the session currency only', async () => {
    const res = await submit(submitBody({ cashPaidOut: 20, counts: [{ currency: 'USD', counted: 230 }, { currency: 'ZWG', counted: 30 }] }));
    expect(res.body.snapshot.expected.USD).toBe('230.00');
    expect(res.body.snapshot.expected.ZWG).toBe('30.00');
  });

  test('only the cashier who opened it can submit, and only OPEN or REJECTED sessions', async () => {
    expect((await submit(submitBody(), as('u-other', 'm-other', 'finance:cash_session:manage'))).status).toBe(403);
    expect((await submit(submitBody(), as('u-cash', 'm-cash'))).status).toBe(403);
    prisma.cashSession.findUnique.mockResolvedValue(session({ status: 'SUBMITTED' }));
    expect((await submit(submitBody())).status).toBe(409);
    prisma.cashSession.findUnique.mockResolvedValue(session({ status: 'RECONCILED' }));
    expect((await submit(submitBody())).status).toBe(409);
    prisma.cashSession.findUnique.mockResolvedValue(session({ churchId: 'church-2' }));
    expect((await submit(submitBody())).status).toBe(404);
  });

  test('every counted currency is required, a difference needs notes, and denominations must add up', async () => {
    expect((await submit(submitBody({ counts: [{ currency: 'USD', counted: 250 }] }))).body.error).toContain('ZWG');
    const short = await submit(submitBody({ counts: [{ currency: 'USD', counted: 240 }, { currency: 'ZWG', counted: 30 }] }));
    expect(short.status).toBe(400);
    expect(short.body.error).toContain('USD short 10.00');
    expect((await submit(submitBody({ counts: [{ currency: 'USD', counted: 240 }, { currency: 'ZWG', counted: 30 }], notes: 'Coins given as change' }))).body.variances.USD).toBe('-10.00');
    const bad = await submit(submitBody({ counts: [{ currency: 'USD', counted: 250, denominations: { '100': 2, '20': 1 } }, { currency: 'ZWG', counted: 30 }] }));
    expect(bad.body.error).toContain('denominations add up to 220.00');
    const good = await submit(submitBody({ counts: [{ currency: 'USD', counted: 250, denominations: { '100': 2, '50': 1 } }, { currency: 'ZWG', counted: 30 }] }));
    expect(good.status).toBe(200);
    expect((await submit(submitBody({ counts: [{ currency: 'USD', counted: 250 }, { currency: 'USD', counted: 1 }] }))).status).toBe(400);
  });

  test('the flip is compare-and-set and snapshot/event are written in the same transaction; submissions are numbered', async () => {
    await submit(submitBody());
    expect(prisma.cashSession.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'cs1', status: 'OPEN' }, data: { status: 'SUBMITTED', submissionNo: 1, submittedBy: 'u-cash' } });
    expect(prisma.cashSessionEvent.create.mock.calls[0][0].data).toMatchObject({ sessionId: 'cs1', action: 'SUBMITTED', actorId: 'u-cash' });
    expect(JSON.parse(prisma.cashSession.update.mock.calls[0][0].data.snapshotJson).receiptCount).toBe(8);
    prisma.cashSession.updateMany.mockResolvedValue({ count: 0 });
    expect((await submit(submitBody())).status).toBe(409);
  });

  test('a receipt that lands while submitting changes the totals and rolls the whole submit back', async () => {
    prisma.receipt.groupBy.mockResolvedValueOnce(groups).mockResolvedValueOnce([...groups, { currency: 'USD', paymentMethod: 'CASH', incomeType: 'OFFERING', _sum: { amount: D(5) }, _count: { _all: 1 } }]);
    const res = await submit(submitBody());
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('receipt was recorded while you were submitting');
    expect(prisma.cashSession.update).not.toHaveBeenCalled();
    expect(prisma.cashSessionEvent.create).not.toHaveBeenCalled();
  });

  test('a rejected session can be corrected and resubmitted, keeping its numbering', async () => {
    prisma.cashSession.findUnique.mockResolvedValue(session({ status: 'REJECTED', submissionNo: 1 }));
    await submit(submitBody());
    expect(prisma.cashSession.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'cs1', status: 'REJECTED' }, data: { submissionNo: 2, status: 'SUBMITTED', reviewNote: null } });
  });
});

describe('reviewing a session', () => {
  const snap = { currency: 'USD', opening: '100.00', cashPaidOut: '0.00', receiptCount: 8, cashReceipts: { USD: '150.00', ZWG: '30.00' }, expected: { USD: '250.00', ZWG: '30.00' }, other: { 'MOBILE_MONEY:USD': '40.00' }, categories: { 'OFFERING:USD': '140.00', 'TITHE:USD': '50.00', 'OFFERING:ZWG': '30.00' } };
  const submitted = (over: Record<string, unknown> = {}) => session({
    status: 'SUBMITTED', submissionNo: 1, submittedBy: 'u-cash', submittedAt: new Date(),
    countsJson: JSON.stringify({ counts: [{ currency: 'USD', counted: 250 }, { currency: 'ZWG', counted: 30 }], cashPaidOut: 0, variances: { USD: '0.00', ZWG: '0.00' } }), snapshotJson: JSON.stringify(snap), ...over,
  });
  const approve = (body: object, auth = REVIEWER()) => request(app).post(`${base}/cs1/approve`).set(auth).send(body);
  const recv = (usd = 250, zwg = 30) => [{ currency: 'USD', amount: usd }, { currency: 'ZWG', amount: zwg }];
  beforeEach(() => prisma.cashSession.findUnique.mockResolvedValue(submitted()));

  test('queue needs the review permission, lists only this church\'s submitted sessions, and flags discrepancies and own sessions', async () => {
    expect((await request(app).get(`${base}/review-queue`).set(CASHIER())).status).toBe(403);
    prisma.cashSession.findMany.mockResolvedValue([submitted(), submitted({ id: 'cs2', handledBy: 'm-rev', countsJson: JSON.stringify({ variances: { USD: '-5.00' } }) })]);
    const res = await request(app).get(`${base}/review-queue`).set(REVIEWER());
    expect(prisma.cashSession.findMany.mock.calls[0][0].where).toEqual({ churchId: 'church-1', status: 'SUBMITTED' });
    expect(res.body.sessions.map((s: { id: string; discrepancy: boolean; ownSession: boolean }) => [s.id, s.discrepancy, s.ownSession])).toEqual([['cs1', false, false], ['cs2', true, true]]);
  });

  test('approving closes the session atomically with its history and writes nothing to the ledger', async () => {
    const res = await approve({ submissionNo: 1, received: recv() });
    expect(res.status).toBe(200);
    expect(prisma.cashSession.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'cs1', status: 'SUBMITTED', submissionNo: 1 }, data: { status: 'RECONCILED', reviewedBy: 'u-rev', closedBy: 'u-rev' } });
    expect(prisma.cashSessionEvent.create.mock.calls[0][0].data).toMatchObject({ action: 'APPROVED', actorId: 'u-rev' });
    // Custody only: no journal, no receipt, no income posting.
    expect(prisma.journalEntry.create).not.toHaveBeenCalled();
    expect(prisma.receipt.create).not.toHaveBeenCalled();
    expect(prisma.receipt.updateMany).not.toHaveBeenCalled();
  });

  test('cannot approve your own session, even holding both roles, and not one you submitted', async () => {
    const both = as('u-cash', 'm-cash', 'finance:cash_session:manage', 'finance:cash_session:review');
    expect((await approve({ submissionNo: 1, received: recv() }, both)).status).toBe(403);
    expect((await request(app).post(`${base}/cs1/reject`).set(both).send({ submissionNo: 1, reason: 'not mine to reject' })).status).toBe(403);
    // Submitted from a different member record but by the same login.
    expect((await approve({ submissionNo: 1, received: recv() }, as('u-cash', 'm-other', 'finance:cash_session:review'))).status).toBe(403);
    expect(prisma.cashSession.updateMany).not.toHaveBeenCalled();
  });

  test('the reviewer must enter what they received; a difference needs a note', async () => {
    expect((await approve({ submissionNo: 1, received: [{ currency: 'USD', amount: 250 }] })).body.error).toContain('ZWG');
    const diff = await approve({ submissionNo: 1, received: recv(245) });
    expect(diff.status).toBe(400);
    expect(diff.body.error).toContain('USD -5.00');
    const ok = await approve({ submissionNo: 1, received: recv(245), note: 'Counted again in front of cashier: 5 short' });
    expect(ok.body.differences).toEqual({ USD: '-5.00' });
  });

  test('two reviewers cannot both approve: the loser gets a conflict and no second event', async () => {
    expect((await approve({ submissionNo: 1, received: recv() })).status).toBe(200);
    prisma.cashSessionEvent.create.mockClear();
    prisma.cashSession.updateMany.mockResolvedValue({ count: 0 });
    expect((await approve({ submissionNo: 1, received: recv() }, REVIEWER('u-rev2', 'm-rev2'))).status).toBe(409);
    expect(prisma.cashSessionEvent.create).not.toHaveBeenCalled();
  });

  test('approval is refused if the reviewer saw an older submission', async () => {
    prisma.cashSession.updateMany.mockResolvedValue({ count: 0 });
    expect((await approve({ submissionNo: 1, received: recv() })).status).toBe(409);
    expect(prisma.cashSession.updateMany.mock.calls[0][0].where.submissionNo).toBe(1);
  });

  test('receipts that changed after submission block approval and roll it back', async () => {
    prisma.receipt.groupBy.mockResolvedValue([...groups, { currency: 'USD', paymentMethod: 'CASH', incomeType: 'OFFERING', _sum: { amount: D(20) }, _count: { _all: 1 } }]);
    const res = await approve({ submissionNo: 1, received: recv() });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Receipts changed after submission');
    expect(prisma.cashSessionEvent.create).not.toHaveBeenCalled();
  });

  test('only submitted sessions can be approved or rejected', async () => {
    for (const status of ['OPEN', 'REJECTED', 'RECONCILED']) {
      prisma.cashSession.findUnique.mockResolvedValue(submitted({ status }));
      expect((await approve({ submissionNo: 1, received: recv() })).status).toBe(409);
    }
    expect((await approve({ submissionNo: 1, received: recv() }, as('u', 'm', 'finance:view'))).status).toBe(403);
  });

  test('rejecting needs a reason, keeps the history, and does not touch any receipt', async () => {
    const reject = (b: object) => request(app).post(`${base}/cs1/reject`).set(REVIEWER()).send(b);
    expect((await reject({ submissionNo: 1, reason: 'no' })).status).toBe(400);
    const ok = await reject({ submissionNo: 1, reason: 'Count is short, please recount' });
    expect(ok.body.status).toBe('REJECTED');
    expect(prisma.cashSession.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'cs1', status: 'SUBMITTED', submissionNo: 1 }, data: { status: 'REJECTED', reviewNote: 'Count is short, please recount' } });
    expect(prisma.cashSessionEvent.create.mock.calls[0][0].data).toMatchObject({ action: 'REJECTED', note: 'Count is short, please recount' });
    expect(prisma.receipt.updateMany).not.toHaveBeenCalled();
    expect(prisma.receipt.update).not.toHaveBeenCalled();
  });

  test('detail shows the transactions, history and whether receipts changed; the owner may read it, strangers may not', async () => {
    prisma.receipt.findMany.mockResolvedValue([{ receiptNumber: 'CH-1', amount: D(10), currency: 'USD', paymentMethod: 'CASH', incomeType: 'OFFERING', status: 'ISSUED', recordedAt: new Date() }]);
    prisma.cashSessionEvent.findMany.mockResolvedValue([{ action: 'SUBMITTED', createdAt: new Date(), actorId: 'u-cash', note: null, data: '{}' }]);
    const res = await request(app).get(`${base}/cs1/detail`).set(REVIEWER());
    expect(res.body).toMatchObject({ status: 'SUBMITTED', changedSinceSubmission: false });
    expect(res.body.receipts[0]).toEqual(expect.objectContaining({ receiptNumber: 'CH-1', amount: 10 }));
    expect(JSON.stringify(res.body.receipts)).not.toContain('memberId'); // no donor identity in the review view
    expect((await request(app).get(`${base}/cs1/detail`).set(CASHIER())).status).toBe(200);
    expect((await request(app).get(`${base}/cs1/detail`).set(as('u-x', 'm-x', 'finance:cash_session:manage'))).status).toBe(403);
    prisma.receipt.groupBy.mockResolvedValue([{ ...groups[0], _sum: { amount: D(1) } }]);
    expect((await request(app).get(`${base}/cs1/detail`).set(REVIEWER())).body.changedSinceSubmission).toBe(true);
  });
});

describe('independent sessions and receipt attribution', () => {
  test('a new session is not blocked by another cashier\'s session or one awaiting review, only by the same cashier\'s open one', async () => {
    prisma.cashSession.findFirst.mockResolvedValue(null);
    prisma.financialAccount.findUnique.mockResolvedValue({ id: 'fa' });
    prisma.cashSession.create.mockResolvedValue(session());
    const open = () => request(app).post(base).set(CASHIER()).send({ openingBalance: 50, currency: 'zwg' });
    expect((await open()).status).toBe(201);
    expect(prisma.cashSession.findFirst.mock.calls[0][0].where).toEqual({ churchId: 'church-1', status: 'OPEN', handledBy: 'm-cash' });
    expect(prisma.cashSession.create.mock.calls[0][0].data).toMatchObject({ currency: 'ZWG', handledBy: 'm-cash', status: 'OPEN' });
    prisma.cashSession.findFirst.mockResolvedValue(session());
    expect((await open()).status).toBe(409);
  });

  test('legacy direct close is refused where the church requires review', async () => {
    prisma.systemSetting.findUnique.mockResolvedValue({ value: true });
    const res = await request(app).post(`${base}/cs1/close`).set(CASHIER()).send({ countedBalance: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('submitted for review');
    expect(prisma.cashSession.updateMany).not.toHaveBeenCalled();
  });
});
