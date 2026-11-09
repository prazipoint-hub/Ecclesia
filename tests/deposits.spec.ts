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
const base = '/api/v2/accounting';
const body = { currency: 'usd', amount: 250, depositDate: '2026-03-02', bankReference: 'SLIP-001' };
const dep = (over: Record<string, unknown> = {}) => ({
  id: 'd1', churchId: 'church-1', currency: 'USD', amount: D(250), depositDate: new Date('2026-03-02'), bankReference: 'SLIP-001', bankName: null, notes: null,
  status: 'PENDING', recordedBy: 'u-rec', verifiedBy: null, verifiedAt: null, rejectReason: null, journalEntryId: null, ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.auditLog.create.mockResolvedValue({});
  prisma.$transaction.mockImplementation(async (fn: unknown) => (typeof fn === 'function' ? (fn as (tx: unknown) => unknown)(prisma) : fn));
});

describe('deposits', () => {
  test('recording needs the permission', async () => {
    const res = await request(app).post(`${base}/deposits`).set(as('u-rec', 'finance:view')).send(body);
    expect(res.status).toBe(403);
  });

  test('records a PENDING deposit, uppercases currency, writes no ledger entry', async () => {
    prisma.deposit.create.mockResolvedValue(dep());
    const res = await request(app).post(`${base}/deposits`).set(as('u-rec', 'finance:deposit:record')).send(body);
    expect(res.status).toBe(201);
    expect(prisma.deposit.create.mock.calls[0][0].data).toMatchObject({ currency: 'USD', recordedBy: 'u-rec' });
    expect(prisma.journalEntry.create).not.toHaveBeenCalled();
  });

  test('duplicate bank reference is a 409', async () => {
    prisma.deposit.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x', meta: { target: 'Deposit_churchId_bankReference_key' } }));
    const res = await request(app).post(`${base}/deposits`).set(as('u-rec', 'finance:deposit:record')).send(body);
    expect(res.status).toBe(409);
  });

  test('idempotency key replays the earlier deposit with 200', async () => {
    prisma.deposit.findFirst.mockResolvedValue(dep());
    const res = await request(app).post(`${base}/deposits`).set({ ...as('u-rec', 'finance:deposit:record'), 'Idempotency-Key': 'key-12345678' }).send(body);
    expect(res.status).toBe(200);
    expect(prisma.deposit.create).not.toHaveBeenCalled();
  });

  test('rejects a future date and non-positive amounts', async () => {
    const h = as('u-rec', 'finance:deposit:record');
    expect((await request(app).post(`${base}/deposits`).set(h).send({ ...body, depositDate: '2999-01-01' })).status).toBe(400);
    expect((await request(app).post(`${base}/deposits`).set(h).send({ ...body, amount: 0 })).status).toBe(400);
  });

  test('the recorder cannot verify their own deposit', async () => {
    prisma.deposit.findUnique.mockResolvedValue(dep());
    const res = await request(app).post(`${base}/deposits/d1/verify`).set(as('u-rec', 'finance:deposit:verify'));
    expect(res.status).toBe(403);
    expect(prisma.deposit.updateMany).not.toHaveBeenCalled();
  });

  test('another church cannot see the deposit', async () => {
    prisma.deposit.findUnique.mockResolvedValue(dep({ churchId: 'church-2' }));
    expect((await request(app).post(`${base}/deposits/d1/verify`).set(as('u-ver', 'finance:deposit:verify'))).status).toBe(404);
  });

  test('verify posts Dr Bank / Cr Cash for the amount, balanced, once', async () => {
    prisma.deposit.findUnique.mockResolvedValue(dep());
    prisma.ledgerAccount.findMany.mockResolvedValue([{ id: 'a-cash', code: '1000', isActive: true }, { id: 'a-bank', code: '1100', isActive: true }]);
    prisma.financialPeriod.findFirst.mockResolvedValue(null);
    prisma.deposit.updateMany.mockResolvedValue({ count: 1 });
    prisma.journalEntry.count.mockResolvedValue(4);
    prisma.journalEntry.create.mockResolvedValue({ id: 'je1', reference: 'JE-2026-000005' });
    const res = await request(app).post(`${base}/deposits/d1/verify`).set(as('u-ver', 'finance:deposit:verify'));
    expect(res.status).toBe(200);
    const data = prisma.journalEntry.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ source: 'DEPOSIT', sourceId: 'd1', status: 'POSTED', postedBy: 'u-ver' });
    const lines = data.lines.createMany.data;
    expect(lines.find((l: { accountId: string }) => l.accountId === 'a-bank').debit.toString()).toBe('250');
    expect(lines.find((l: { accountId: string }) => l.accountId === 'a-cash').credit.toString()).toBe('250');
  });

  test('second verifier loses the compare-and-set and posts nothing', async () => {
    prisma.deposit.findUnique.mockResolvedValue(dep());
    prisma.ledgerAccount.findMany.mockResolvedValue([{ id: 'a-cash', code: '1000', isActive: true }, { id: 'a-bank', code: '1100', isActive: true }]);
    prisma.financialPeriod.findFirst.mockResolvedValue(null);
    prisma.deposit.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(app).post(`${base}/deposits/d1/verify`).set(as('u-ver', 'finance:deposit:verify'));
    expect(res.status).toBe(409);
    expect(prisma.journalEntry.create).not.toHaveBeenCalled();
  });

  test('closed period blocks verification', async () => {
    prisma.deposit.findUnique.mockResolvedValue(dep());
    prisma.ledgerAccount.findMany.mockResolvedValue([{ id: 'a-cash', code: '1000', isActive: true }, { id: 'a-bank', code: '1100', isActive: true }]);
    prisma.financialPeriod.findFirst.mockResolvedValue({ id: 'p1', name: 'Mar 2026', status: 'CLOSED' });
    expect((await request(app).post(`${base}/deposits/d1/verify`).set(as('u-ver', 'finance:deposit:verify'))).status).toBe(409);
    expect(prisma.deposit.updateMany).not.toHaveBeenCalled();
  });

  test('reject needs a reason and a different person', async () => {
    prisma.deposit.findUnique.mockResolvedValue(dep());
    const h = as('u-ver', 'finance:deposit:verify');
    expect((await request(app).post(`${base}/deposits/d1/reject`).set(h).send({ reason: 'x' })).status).toBe(400);
    prisma.deposit.updateMany.mockResolvedValue({ count: 1 });
    expect((await request(app).post(`${base}/deposits/d1/reject`).set(h).send({ reason: 'slip does not match' })).status).toBe(200);
    expect((await request(app).post(`${base}/deposits/d1/reject`).set(as('u-rec', 'finance:deposit:verify')).send({ reason: 'slip does not match' })).status).toBe(403);
  });

  test('overview keeps approved and pending apart, per currency, and derives undeposited', async () => {
    prisma.cashSession.findMany.mockResolvedValue([
      { id: 's1', status: 'RECONCILED', snapshotJson: JSON.stringify({ cashReceipts: { USD: '300.00', ZWG: '30.00' } }) },
      { id: 's2', status: 'RECONCILED', snapshotJson: JSON.stringify({ cashReceipts: { USD: '100.00' } }) },
      { id: 's3', status: 'SUBMITTED', snapshotJson: JSON.stringify({ cashReceipts: { USD: '75.00' } }) },
    ]);
    prisma.deposit.findMany.mockResolvedValue([
      { status: 'VERIFIED', currency: 'USD', amount: D(250) },
      { status: 'PENDING', currency: 'USD', amount: D(50) },
    ]);
    const res = await request(app).get(`${base}/treasurer/overview`).set(as('u-t', 'finance:view'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      approvedCash: { USD: '400.00', ZWG: '30.00' }, approvedSessions: 2, pendingCash: { USD: '75.00' }, pendingSessions: 1,
      depositsVerified: { USD: '250.00' }, depositsAwaitingVerification: { USD: '50.00' }, undepositedCash: { USD: '100.00', ZWG: '30.00' },
    });
  });
});
