import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
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
const D = (v: string | number) => new Prisma.Decimal(v);
const P2002 = (target: string) => new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x', meta: { target } });

const user = (id: string, memberId: string | null, ...permissions: string[]) => ({
  Authorization: `Bearer ${jwt.sign({ sub: id, email: `${id}@example.com`, churchId: 'church-1', memberId, permissions, sessionId: 's1', tokenId: 't1' }, jwtSecret, { expiresIn: '5m' })}`,
});
const as = (...permissions: string[]) => user('user-1', 'member-1', ...permissions);
const asOther = (...permissions: string[]) => user('user-2', 'member-2', ...permissions);

const account = (code: string, type: string, over: Record<string, unknown> = {}) => ({
  id: `acc-${code}`, churchId: 'church-1', code, name: `Account ${code}`, type, description: null, parentId: null, isActive: true, isSystem: false, ...over,
});
const CHART = ['1000', '1100', '1200', '3100', '4000', '4100', '4200', '4300', '4900', '5000', '5100', '5200', '5300', '5400', '5900'].map((c) =>
  account(c, c[0] === '1' ? 'ASSET' : c[0] === '3' ? 'EQUITY' : c[0] === '4' ? 'REVENUE' : 'EXPENSE')
);
const entry = (over: Record<string, unknown> = {}) => ({
  id: 'je1', churchId: 'church-1', reference: 'JE-2026-000001', description: 'Test', postDate: new Date('2026-03-10T00:00:00Z'), periodId: null, status: 'DRAFT',
  source: 'MANUAL', sourceId: null, reversesEntryId: null, reversalReason: null, createdBy: 'user-1', postedBy: null, postedAt: null,
  lines: [
    { id: 'l1', accountId: 'acc-1000', debit: D('100'), credit: D('0'), memo: null, fundId: null, account: { code: '1000', name: 'Cash', type: 'ASSET' } },
    { id: 'l2', accountId: 'acc-4000', debit: D('0'), credit: D('100'), memo: null, fundId: null, account: { code: '4000', name: 'Tithes', type: 'REVENUE' } },
  ],
  ...over,
});
const bodyLines = [{ accountId: 'acc-1000', debit: 100 }, { accountId: 'acc-4000', credit: 100 }];

beforeEach(() => {
  vi.resetAllMocks();
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.$transaction.mockImplementation((async (arg: unknown) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg as unknown[]))) as never);
  prisma.auditLog.create.mockResolvedValue({});
  prisma.financialPeriod.findFirst.mockResolvedValue(null);
});

describe('chart of accounts', () => {
  test('permissions', async () => {
    expect((await request(app).get('/api/v2/accounting/accounts').set(as())).status).toBe(403);
    expect((await request(app).post('/api/v2/accounting/accounts').set(as('finance:view')).send({})).status).toBe(403);
  });

  test('balances follow the account type: assets by debits, revenue by credits', async () => {
    prisma.ledgerAccount.findMany.mockResolvedValue([account('1000', 'ASSET'), account('4000', 'REVENUE'), account('5000', 'EXPENSE')]);
    prisma.journalLine.groupBy.mockResolvedValue([
      { accountId: 'acc-1000', _sum: { debit: D('150.10'), credit: D('50') } },
      { accountId: 'acc-4000', _sum: { debit: D('0'), credit: D('150.10') } },
      { accountId: 'acc-5000', _sum: { debit: D('50'), credit: D('0') } },
    ]);
    const res = await request(app).get('/api/v2/accounting/accounts').set(as('finance:view'));
    expect(res.body.map((a: { code: string; balance: number }) => [a.code, a.balance])).toEqual([['1000', 100.1], ['4000', 150.1], ['5000', 50]]);
    expect(prisma.ledgerAccount.findMany.mock.calls[0][0].where).toEqual({ churchId: 'church-1' });
  });

  test('create validates, rejects duplicate codes and mismatched parents', async () => {
    const as1 = as('finance:coa:manage');
    expect((await request(app).post('/api/v2/accounting/accounts').set(as1).send({ code: 'bad code!', name: 'x', type: 'ASSET' })).status).toBe(400);
    expect((await request(app).post('/api/v2/accounting/accounts').set(as1).send({ code: '1', name: 'x', type: 'NOPE' })).status).toBe(400);
    prisma.ledgerAccount.findUnique.mockResolvedValue(account('1000', 'ASSET'));
    expect((await request(app).post('/api/v2/accounting/accounts').set(as1).send({ code: '4001', name: 'x', type: 'REVENUE', parentId: 'acc-1000' })).status).toBe(400);
    prisma.ledgerAccount.create.mockRejectedValue(P2002('churchId_code'));
    expect((await request(app).post('/api/v2/accounting/accounts').set(as1).send({ code: '1000', name: 'x', type: 'ASSET' })).status).toBe(409);
  });

  test('seeding adds only the missing standard accounts and is repeatable', async () => {
    prisma.ledgerAccount.findMany.mockResolvedValue([account('1000', 'ASSET'), account('4000', 'REVENUE')]);
    prisma.ledgerAccount.createMany.mockResolvedValue({ count: 15 });
    const res = await request(app).post('/api/v2/accounting/accounts/seed-default').set(as('finance:coa:manage'));
    expect(res.body).toEqual({ added: 15, existing: 2 });
    const created = prisma.ledgerAccount.createMany.mock.calls[0][0].data as { code: string; isSystem: boolean; churchId: string }[];
    expect(created.map((a) => a.code)).not.toContain('1000');
    expect(created.every((a) => a.isSystem && a.churchId === 'church-1')).toBe(true);
  });

  test('system accounts cannot be deactivated', async () => {
    prisma.ledgerAccount.findUnique.mockResolvedValue(account('1000', 'ASSET', { isSystem: true }));
    expect((await request(app).put('/api/v2/accounting/accounts/acc-1000').set(as('finance:coa:manage')).send({ isActive: false })).status).toBe(409);
  });

  test("another church's account is 404", async () => {
    prisma.ledgerAccount.findUnique.mockResolvedValue(account('1000', 'ASSET', { churchId: 'church-2' }));
    expect((await request(app).put('/api/v2/accounting/accounts/acc-1000').set(as('finance:coa:manage')).send({ name: 'x' })).status).toBe(404);
  });
});

describe('financial periods', () => {
  const period = (over: Record<string, unknown> = {}) => ({ id: 'p1', churchId: 'church-1', name: 'FY2026', startDate: new Date('2026-01-01T00:00:00Z'), endDate: new Date('2026-12-31T23:59:59.999Z'), status: 'OPEN', ...over });
  const manage = as('finance:period:manage');

  test('create normalises dates, rejects bad ranges and overlaps', async () => {
    expect((await request(app).post('/api/v2/accounting/periods').set(manage).send({ name: 'x', startDate: '2026-05-01', endDate: '2026-04-01' })).status).toBe(400);
    prisma.financialPeriod.findFirst.mockResolvedValueOnce(period());
    expect((await request(app).post('/api/v2/accounting/periods').set(manage).send({ name: 'x', startDate: '2026-05-01', endDate: '2026-06-01' })).status).toBe(409);
    prisma.financialPeriod.findFirst.mockResolvedValue(null);
    prisma.financialPeriod.create.mockResolvedValue(period());
    await request(app).post('/api/v2/accounting/periods').set(manage).send({ name: 'FY2026', startDate: '2026-01-01T15:00:00Z', endDate: '2026-12-31' });
    const data = prisma.financialPeriod.create.mock.calls[0][0].data;
    expect(data.startDate.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(data.endDate.toISOString()).toBe('2026-12-31T23:59:59.999Z');
  });

  test('cannot close while drafts remain; closes otherwise', async () => {
    prisma.financialPeriod.findUnique.mockResolvedValue(period());
    prisma.journalEntry.count.mockResolvedValue(2);
    expect((await request(app).post('/api/v2/accounting/periods/p1/close').set(manage)).status).toBe(409);
    prisma.journalEntry.count.mockResolvedValue(0);
    prisma.financialPeriod.updateMany.mockResolvedValue({ count: 1 });
    expect((await request(app).post('/api/v2/accounting/periods/p1/close').set(manage)).status).toBe(200);
    expect(prisma.financialPeriod.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'p1', status: 'OPEN' }, data: { status: 'CLOSED', closedBy: 'user-1' } });
  });

  test('reopening needs a reason, a closed period, and is audited', async () => {
    prisma.financialPeriod.findUnique.mockResolvedValue(period({ status: 'CLOSED' }));
    expect((await request(app).post('/api/v2/accounting/periods/p1/reopen').set(manage).send({})).status).toBe(400);
    prisma.financialPeriod.updateMany.mockResolvedValue({ count: 1 });
    expect((await request(app).post('/api/v2/accounting/periods/p1/reopen').set(manage).send({ reason: 'Late invoice found' })).status).toBe(200);
    expect(prisma.auditLog.create.mock.calls.at(-1)?.[0].data).toMatchObject({ action: 'FINANCIAL_PERIOD_REOPENED' });
    prisma.financialPeriod.findUnique.mockResolvedValue(period());
    expect((await request(app).post('/api/v2/accounting/periods/p1/reopen').set(manage).send({ reason: 'x' })).status).toBe(409);
  });
});

describe('journal entries', () => {
  const create = as('finance:journal:create');
  beforeEach(() => {
    prisma.ledgerAccount.findMany.mockResolvedValue([account('1000', 'ASSET'), account('4000', 'REVENUE')]);
    prisma.journalEntry.count.mockResolvedValue(0);
    prisma.journalEntry.create.mockResolvedValue(entry());
  });
  const post = (body: object) => request(app).post('/api/v2/accounting/journals').set(create).send({ description: 'Test', postDate: '2026-03-10', ...body });

  test.each([
    ['unbalanced', { lines: [{ accountId: 'acc-1000', debit: 100 }, { accountId: 'acc-4000', credit: 99.99 }] }],
    ['a single line', { lines: [{ accountId: 'acc-1000', debit: 100 }] }],
    ['debit and credit on one line', { lines: [{ accountId: 'acc-1000', debit: 5, credit: 5 }, { accountId: 'acc-4000', credit: 0, debit: 0 }] }],
    ['an empty line', { lines: [{ accountId: 'acc-1000', debit: 100 }, { accountId: 'acc-4000' }] }],
    ['a negative amount', { lines: [{ accountId: 'acc-1000', debit: -5 }, { accountId: 'acc-4000', credit: -5 }] }],
    ['three decimals', { lines: [{ accountId: 'acc-1000', debit: 1.005 }, { accountId: 'acc-4000', credit: 1.005 }] }],
    ['unknown extra field', { status: 'POSTED', lines: bodyLines }],
  ])('rejects %s', async (_n, body) => {
    expect((await post(body)).status).toBe(400);
    expect(prisma.journalEntry.create).not.toHaveBeenCalled();
  });

  test('the balance message names the difference', async () => {
    const res = await post({ lines: [{ accountId: 'acc-1000', debit: 100 }, { accountId: 'acc-4000', credit: 90 }] });
    expect(res.body.error).toMatch(/debits 100\.00, credits 90\.00/);
  });

  test('floating point sums that should balance do balance (0.1 + 0.2 = 0.3)', async () => {
    const res = await post({ lines: [{ accountId: 'acc-1000', debit: 0.1 }, { accountId: 'acc-1000', debit: 0.2 }, { accountId: 'acc-4000', credit: 0.3 }] });
    expect(res.status).toBe(201);
  });

  test('unknown, inactive or foreign accounts are refused', async () => {
    prisma.ledgerAccount.findMany.mockResolvedValue([account('1000', 'ASSET')]);
    expect((await post({ lines: bodyLines })).status).toBe(400);
    prisma.ledgerAccount.findMany.mockResolvedValue([account('1000', 'ASSET'), account('4000', 'REVENUE', { isActive: false })]);
    expect((await post({ lines: bodyLines })).body.error).toMatch(/inactive/);
    expect(prisma.ledgerAccount.findMany.mock.calls[0][0].where).toMatchObject({ churchId: 'church-1' });
  });

  test('a closed period blocks new entries dated inside it', async () => {
    prisma.financialPeriod.findFirst.mockResolvedValue({ id: 'p1', name: 'Q1', status: 'CLOSED' });
    const res = await post({ lines: bodyLines });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/closed/);
  });

  test('creates a numbered draft stamped with the author', async () => {
    const res = await post({ lines: bodyLines });
    expect(res.status).toBe(201);
    const data = prisma.journalEntry.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ churchId: 'church-1', createdBy: 'user-1', status: 'DRAFT', source: 'MANUAL' });
    expect(data.reference).toMatch(/^JE-\d{4}-000001$/);
    expect(data.lines.createMany.data).toHaveLength(2);
  });

  test('a reference collision is retried with the next number', async () => {
    prisma.journalEntry.create.mockRejectedValueOnce(P2002('churchId_reference')).mockResolvedValue(entry());
    prisma.journalEntry.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    expect((await post({ lines: bodyLines })).status).toBe(201);
    expect(prisma.journalEntry.create.mock.calls[1][0].data.reference).toMatch(/-000002$/);
  });

  test('posting needs the approve permission and a different person than the preparer', async () => {
    prisma.journalEntry.findUnique.mockResolvedValue(entry());
    expect((await request(app).post('/api/v2/accounting/journals/je1/post').set(create)).status).toBe(403);
    const self = await request(app).post('/api/v2/accounting/journals/je1/post').set(as('finance:journal:approve'));
    expect(self.status).toBe(403);
    expect(self.body.error).toMatch(/different person/);
    expect(prisma.journalEntry.updateMany).not.toHaveBeenCalled();
  });

  test('a second person can post it, once', async () => {
    prisma.journalEntry.findUnique.mockResolvedValue(entry());
    prisma.ledgerAccount.findMany.mockResolvedValue([account('1000', 'ASSET'), account('4000', 'REVENUE')]);
    prisma.journalEntry.updateMany.mockResolvedValue({ count: 1 });
    const ok = await request(app).post('/api/v2/accounting/journals/je1/post').set(asOther('finance:journal:approve'));
    expect(ok.status).toBe(200);
    expect(prisma.journalEntry.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'je1', status: 'DRAFT' }, data: { status: 'POSTED', postedBy: 'user-2' } });

    prisma.journalEntry.updateMany.mockResolvedValue({ count: 0 });
    expect((await request(app).post('/api/v2/accounting/journals/je1/post').set(asOther('finance:journal:approve'))).status).toBe(409);
  });

  test('posted entries cannot be posted again, edited or deleted', async () => {
    prisma.journalEntry.findUnique.mockResolvedValue(entry({ status: 'POSTED' }));
    expect((await request(app).post('/api/v2/accounting/journals/je1/post').set(asOther('finance:journal:approve'))).status).toBe(409);
    expect((await request(app).put('/api/v2/accounting/journals/je1').set(create).send({ description: 'x', postDate: '2026-03-10', lines: bodyLines })).status).toBe(409);
    expect((await request(app).delete('/api/v2/accounting/journals/je1').set(create)).status).toBe(409);
    expect(prisma.journalEntry.deleteMany).not.toHaveBeenCalled();
  });

  test("only the author can change or delete their draft", async () => {
    prisma.journalEntry.findUnique.mockResolvedValue(entry({ createdBy: 'user-9' }));
    expect((await request(app).delete('/api/v2/accounting/journals/je1').set(create)).status).toBe(403);
    expect((await request(app).put('/api/v2/accounting/journals/je1').set(create).send({ description: 'x', postDate: '2026-03-10', lines: bodyLines })).status).toBe(403);
  });

  test("another church's entry is 404", async () => {
    prisma.journalEntry.findUnique.mockResolvedValue(entry({ churchId: 'church-2' }));
    expect((await request(app).get('/api/v2/accounting/journals/je1').set(as('finance:view'))).status).toBe(404);
  });

  describe('reversal', () => {
    const reverse = as('finance:journal:reverse');
    test('creates a mirror entry, marks the original reversed and keeps both', async () => {
      prisma.journalEntry.findUnique.mockResolvedValue(entry({ status: 'POSTED' }));
      prisma.journalEntry.updateMany.mockResolvedValue({ count: 1 });
      prisma.journalEntry.count.mockResolvedValue(1);
      prisma.journalEntry.create.mockImplementation(async ({ data }: { data: Record<string, unknown> & { lines: { createMany: { data: Array<Record<string, Prisma.Decimal>> } } } }) =>
        entry({ id: 'je2', status: 'POSTED', source: 'REVERSAL', reversesEntryId: 'je1', lines: data.lines.createMany.data.map((l, i) => ({ id: `r${i}`, ...l, account: { code: 'x', name: 'x', type: 'ASSET' } })) })
      );
      const res = await request(app).post('/api/v2/accounting/journals/je1/reverse').set(reverse).send({ reason: 'Wrong fund' });
      expect(res.status).toBe(201);
      expect(prisma.journalEntry.updateMany.mock.calls[0][0]).toEqual({ where: { id: 'je1', status: 'POSTED' }, data: { status: 'REVERSED' } });
      const created = prisma.journalEntry.create.mock.calls[0][0].data;
      expect(created).toMatchObject({ source: 'REVERSAL', reversesEntryId: 'je1', status: 'POSTED' });
      const lines = created.lines.createMany.data as Array<{ accountId: string; debit: Prisma.Decimal; credit: Prisma.Decimal }>;
      expect(lines.find((l) => l.accountId === 'acc-1000')).toMatchObject({ debit: D(0), credit: D(100) });
      expect(lines.find((l) => l.accountId === 'acc-4000')).toMatchObject({ debit: D(100), credit: D(0) });
    });

    test('needs a reason; drafts, reversed entries and reversals cannot be reversed', async () => {
      prisma.journalEntry.findUnique.mockResolvedValue(entry({ status: 'POSTED' }));
      expect((await request(app).post('/api/v2/accounting/journals/je1/reverse').set(reverse).send({})).status).toBe(400);
      for (const over of [{ status: 'DRAFT' }, { status: 'REVERSED' }, { status: 'POSTED', source: 'REVERSAL' }]) {
        prisma.journalEntry.findUnique.mockResolvedValue(entry(over));
        expect((await request(app).post('/api/v2/accounting/journals/je1/reverse').set(reverse).send({ reason: 'x' })).status).toBe(409);
      }
    });

    test('a double reversal race is a conflict, not a duplicate', async () => {
      prisma.journalEntry.findUnique.mockResolvedValue(entry({ status: 'POSTED' }));
      prisma.journalEntry.updateMany.mockResolvedValue({ count: 1 });
      prisma.journalEntry.count.mockResolvedValue(1);
      prisma.journalEntry.create.mockRejectedValue(P2002('reversesEntryId'));
      expect((await request(app).post('/api/v2/accounting/journals/je1/reverse').set(reverse).send({ reason: 'x' })).status).toBe(409);
    });

    test('cannot reverse into a closed period', async () => {
      prisma.journalEntry.findUnique.mockResolvedValue(entry({ status: 'POSTED' }));
      prisma.financialPeriod.findFirst.mockResolvedValue({ id: 'p1', name: 'Q1', status: 'CLOSED' });
      expect((await request(app).post('/api/v2/accounting/journals/je1/reverse').set(reverse).send({ reason: 'x' })).status).toBe(409);
      expect(prisma.journalEntry.updateMany).not.toHaveBeenCalled();
    });
  });
});

describe('opening balances', () => {
  const open = as('finance:opening:set');
  beforeEach(() => {
    prisma.journalEntry.count.mockResolvedValue(0);
    prisma.journalEntry.create.mockImplementation(async ({ data }: { data: { lines: { createMany: { data: Array<Record<string, unknown>> } } } }) =>
      entry({ id: 'open1', status: 'POSTED', source: 'OPENING', lines: data.lines.createMany.data.map((l, i) => ({ id: `o${i}`, ...l, account: { code: 'x', name: 'x', type: 'ASSET' } })) })
    );
  });

  test('balances the entry through Opening Balance Equity', async () => {
    const accounts = [account('1000', 'ASSET'), account('1100', 'ASSET'), account('2000', 'LIABILITY'), account('3100', 'EQUITY')];
    prisma.ledgerAccount.findMany.mockImplementation(async ({ where }: { where: { id?: unknown; code?: unknown } }) => (where.code ? [accounts[3]] : accounts.slice(0, 3)));
    const res = await request(app).post('/api/v2/accounting/opening-balances').set(open).send({ asOf: '2026-01-01', balances: [{ accountId: 'acc-1000', amount: 500 }, { accountId: 'acc-1100', amount: 1500 }, { accountId: 'acc-2000', amount: 300 }] });
    expect(res.status).toBe(201);
    const lines = prisma.journalEntry.create.mock.calls[0][0].data.lines.createMany.data as Array<{ accountId: string; debit: Prisma.Decimal; credit: Prisma.Decimal }>;
    expect(lines.find((l) => l.accountId === 'acc-3100')).toMatchObject({ debit: D(0), credit: D(1700) });
    const total = (k: 'debit' | 'credit') => lines.reduce((s, l) => s.plus(l[k]), D(0));
    expect(total('debit').equals(total('credit'))).toBe(true);
    expect(prisma.journalEntry.create.mock.calls[0][0].data).toMatchObject({ source: 'OPENING', sourceId: 'opening', status: 'POSTED' });
  });

  test('refuses income accounts, a missing equity account, and a second run', async () => {
    prisma.ledgerAccount.findMany.mockImplementation(async ({ where }: { where: { code?: unknown } }) => (where.code ? [account('3100', 'EQUITY')] : [account('4000', 'REVENUE')]));
    expect((await request(app).post('/api/v2/accounting/opening-balances').set(open).send({ asOf: '2026-01-01', balances: [{ accountId: 'acc-4000', amount: 5 }] })).status).toBe(400);

    prisma.ledgerAccount.findMany.mockImplementation(async ({ where }: { where: { code?: unknown } }) => (where.code ? [] : [account('1000', 'ASSET')]));
    expect((await request(app).post('/api/v2/accounting/opening-balances').set(open).send({ asOf: '2026-01-01', balances: [{ accountId: 'acc-1000', amount: 5 }] })).status).toBe(400);

    prisma.ledgerAccount.findMany.mockImplementation(async ({ where }: { where: { code?: unknown } }) => (where.code ? [account('3100', 'EQUITY')] : [account('1000', 'ASSET')]));
    prisma.journalEntry.create.mockRejectedValue(P2002('churchId_source_sourceId'));
    expect((await request(app).post('/api/v2/accounting/opening-balances').set(open).send({ asOf: '2026-01-01', balances: [{ accountId: 'acc-1000', amount: 5 }] })).status).toBe(409);
  });
});

describe('syncing receipts and expenditures', () => {
  const sync = as('finance:journal:approve');
  const receipt = (over: Record<string, unknown> = {}) => ({
    id: 'r1', churchId: 'church-1', fundId: 'fund-1', amount: D('25.50'), incomeType: 'TITHE', paymentMethod: 'CASH', receiptNumber: 'CH-2026-000001', status: 'ISSUED',
    issuedAt: new Date('2026-03-01T10:00:00Z'), ...over,
  });
  beforeEach(() => {
    prisma.ledgerAccount.findMany.mockResolvedValue(CHART);
    prisma.journalEntry.findMany.mockResolvedValue([]);
    prisma.receipt.findMany.mockResolvedValue([]);
    prisma.expenditure.findMany.mockResolvedValue([]);
    prisma.journalEntry.count.mockResolvedValue(0);
    prisma.journalEntry.create.mockResolvedValue(entry());
  });

  test('needs the standard chart first', async () => {
    prisma.ledgerAccount.findMany.mockResolvedValue([]);
    expect((await request(app).post('/api/v2/accounting/sync').set(sync).send({})).status).toBe(400);
  });

  test('posts each receipt as a balanced entry to the right accounts, tagged with its fund', async () => {
    prisma.receipt.findMany.mockResolvedValue([receipt(), receipt({ id: 'r2', paymentMethod: 'MOBILE_MONEY', incomeType: 'DONATION', amount: D('10') })]);
    const res = await request(app).post('/api/v2/accounting/sync').set(sync).send({});
    expect(res.body).toMatchObject({ receipts: 2, expenditures: 0, total: 35.5, preview: false });
    const first = prisma.journalEntry.create.mock.calls[0][0].data;
    expect(first).toMatchObject({ source: 'RECEIPT', sourceId: 'r1', status: 'POSTED', description: 'Receipt CH-2026-000001' });
    expect(first.lines.createMany.data).toMatchObject([
      { accountId: 'acc-1000', debit: D('25.5'), credit: D(0), fundId: 'fund-1' },
      { accountId: 'acc-4000', debit: D(0), credit: D('25.5'), fundId: 'fund-1' },
    ]);
    const second = prisma.journalEntry.create.mock.calls[1][0].data.lines.createMany.data;
    expect(second.map((l: { accountId: string }) => l.accountId)).toEqual(['acc-1200', 'acc-4200']);
  });

  test('preview reports without writing anything', async () => {
    prisma.receipt.findMany.mockResolvedValue([receipt()]);
    const res = await request(app).post('/api/v2/accounting/sync').set(sync).send({ preview: true });
    expect(res.body).toMatchObject({ preview: true, receipts: 1, total: 25.5 });
    expect(prisma.journalEntry.create).not.toHaveBeenCalled();
  });

  test('items that already have an entry are not posted twice', async () => {
    prisma.receipt.findMany.mockResolvedValue([receipt()]);
    prisma.journalEntry.findMany.mockResolvedValue([{ id: 'je9', sourceId: 'r1', status: 'POSTED' }]);
    const res = await request(app).post('/api/v2/accounting/sync').set(sync).send({});
    expect(res.body.receipts).toBe(0);
    expect(prisma.journalEntry.create).not.toHaveBeenCalled();
  });

  test('a concurrent run that wins the race is not counted as a failure', async () => {
    prisma.receipt.findMany.mockResolvedValue([receipt()]);
    prisma.journalEntry.create.mockRejectedValue(P2002('churchId_source_sourceId'));
    const res = await request(app).post('/api/v2/accounting/sync').set(sync).send({});
    expect(res.body).toMatchObject({ receipts: 0, failed: 0 });
  });

  test('receipts dated in a closed period are held back and counted', async () => {
    prisma.receipt.findMany.mockResolvedValue([receipt()]);
    prisma.financialPeriod.findFirst.mockResolvedValue({ id: 'p1', name: 'Q1', status: 'CLOSED' });
    const res = await request(app).post('/api/v2/accounting/sync').set(sync).send({});
    expect(res.body).toMatchObject({ receipts: 0, blockedByClosedPeriod: 1 });
  });

  test('a voided receipt that was posted gets reversed', async () => {
    prisma.receipt.findMany.mockResolvedValue([receipt({ status: 'VOIDED' })]);
    prisma.journalEntry.findMany.mockResolvedValue([{ id: 'je1', sourceId: 'r1', status: 'POSTED' }]);
    prisma.journalEntry.findUnique.mockResolvedValue(entry({ status: 'POSTED', source: 'RECEIPT', sourceId: 'r1' }));
    prisma.journalEntry.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app).post('/api/v2/accounting/sync').set(sync).send({});
    expect(res.body.reversed).toBe(1);
    expect(prisma.journalEntry.create.mock.calls[0][0].data).toMatchObject({ source: 'REVERSAL', reversesEntryId: 'je1' });
  });

  test('a voided receipt that was never posted is ignored', async () => {
    prisma.receipt.findMany.mockResolvedValue([receipt({ status: 'VOIDED' })]);
    const res = await request(app).post('/api/v2/accounting/sync').set(sync).send({});
    expect(res.body).toMatchObject({ receipts: 0, reversed: 0 });
  });

  test('paid expenditures debit the matching expense account and credit the bank', async () => {
    prisma.expenditure.findMany.mockResolvedValue([{ id: 'x1', churchId: 'church-1', fundId: 'fund-1', amount: D('80'), purpose: 'Roof repair', category: 'Building', status: 'PAID', paidAt: new Date('2026-03-05T00:00:00Z') }]);
    const res = await request(app).post('/api/v2/accounting/sync').set(sync).send({});
    expect(res.body.expenditures).toBe(1);
    expect(prisma.journalEntry.create.mock.calls[0][0].data.lines.createMany.data).toMatchObject([
      { accountId: 'acc-5100', debit: D(80) },
      { accountId: 'acc-1100', credit: D(80) },
    ]);
  });
});

describe('reports', () => {
  const view = as('finance:view');
  const chart = [account('1000', 'ASSET'), account('2000', 'LIABILITY'), account('3000', 'EQUITY'), account('4000', 'REVENUE'), account('5000', 'EXPENSE')];
  const sums = (rows: [string, string, string][]) => rows.map(([code, debit, credit]) => ({ accountId: `acc-${code}`, _sum: { debit: D(debit), credit: D(credit) } }));

  test('trial balance nets each account to one side and checks it balances', async () => {
    prisma.ledgerAccount.findMany.mockResolvedValue(chart);
    prisma.journalLine.groupBy.mockResolvedValue(sums([['1000', '700.10', '100'], ['3000', '0', '500'], ['4000', '0', '200.10'], ['5000', '100', '0']]));
    const res = await request(app).get('/api/v2/accounting/reports/trial-balance').set(view);
    expect(res.body.rows.map((r: { code: string; debit: number; credit: number }) => [r.code, r.debit, r.credit])).toEqual([['1000', 600.1, 0], ['3000', 0, 500], ['4000', 0, 200.1], ['5000', 100, 0]]);
    expect(res.body).toMatchObject({ totalDebit: 700.1, totalCredit: 700.1, balanced: true });
  });

  test('an out-of-balance ledger is flagged rather than hidden', async () => {
    prisma.ledgerAccount.findMany.mockResolvedValue(chart);
    prisma.journalLine.groupBy.mockResolvedValue(sums([['1000', '100', '0'], ['4000', '0', '99']]));
    expect((await request(app).get('/api/v2/accounting/reports/trial-balance').set(view)).body.balanced).toBe(false);
  });

  test('the as-of date bounds the report to the end of that day', async () => {
    prisma.ledgerAccount.findMany.mockResolvedValue(chart);
    prisma.journalLine.groupBy.mockResolvedValue([]);
    await request(app).get('/api/v2/accounting/reports/trial-balance?asOf=2026-03-31').set(view);
    const where = prisma.journalLine.groupBy.mock.calls[0][0].where;
    expect(where.entry.churchId).toBe('church-1');
    expect(where.entry.status.in).toEqual(['POSTED', 'REVERSED']);
    expect(where.entry.postDate.lte.toISOString()).toBe('2026-03-31T23:59:59.999Z');
  });

  test('income statement: surplus is revenue less expenses', async () => {
    prisma.ledgerAccount.findMany.mockResolvedValue(chart);
    prisma.journalLine.groupBy.mockResolvedValue(sums([['4000', '0', '1000.50'], ['5000', '400.25', '0']]));
    const res = await request(app).get('/api/v2/accounting/reports/income-statement?from=2026-01-01&to=2026-12-31').set(view);
    expect(res.body).toMatchObject({ totalRevenue: 1000.5, totalExpenses: 400.25, netSurplus: 600.25 });
  });

  test('balance sheet balances once the current surplus is counted as equity', async () => {
    prisma.ledgerAccount.findMany.mockResolvedValue(chart);
    prisma.journalLine.groupBy.mockResolvedValue(sums([['1000', '1200', '100'], ['2000', '0', '100'], ['3000', '0', '500'], ['4000', '0', '600'], ['5000', '100', '0']]));
    const res = await request(app).get('/api/v2/accounting/reports/balance-sheet').set(view);
    expect(res.body).toMatchObject({ totalAssets: 1100, totalLiabilities: 100, currentSurplus: 500, totalEquity: 1000, balanced: true });
  });

  test('account ledger shows a running balance from the opening position', async () => {
    prisma.ledgerAccount.findUnique.mockResolvedValue(account('1000', 'ASSET'));
    prisma.journalLine.aggregate.mockResolvedValue({ _sum: { debit: D('200'), credit: D('50') } });
    prisma.journalLine.findMany.mockResolvedValue([
      { id: 'a', debit: D('100'), credit: D('0'), memo: null, entry: { id: 'e1', reference: 'JE-1', description: 'In', postDate: new Date('2026-02-01'), status: 'POSTED' } },
      { id: 'b', debit: D('0'), credit: D('30.25'), memo: 'out', entry: { id: 'e2', reference: 'JE-2', description: 'Out', postDate: new Date('2026-02-02'), status: 'POSTED' } },
    ]);
    const res = await request(app).get('/api/v2/accounting/accounts/acc-1000/ledger?from=2026-02-01').set(view);
    expect(res.body.openingBalance).toBe(150);
    expect(res.body.items.map((i: { balance: number }) => i.balance)).toEqual([250, 219.75]);
    expect(res.body.closingBalance).toBe(219.75);
  });
});

describe('budgets', () => {
  const create = as('finance:budget:create');
  const budgetRow = (over: Record<string, unknown> = {}) => ({
    id: 'b1', churchId: 'church-1', name: '2026', fiscalYear: 2026, status: 'DRAFT', createdBy: 'user-1', approvedBy: null, approvedAt: null,
    items: [
      { id: 'i1', accountId: 'acc-4000', fundId: null, amount: D('1000'), account: { code: '4000', name: 'Tithes', type: 'REVENUE' } },
      { id: 'i2', accountId: 'acc-5000', fundId: null, amount: D('400'), account: { code: '5000', name: 'Admin', type: 'EXPENSE' } },
    ],
    ...over,
  });
  const input = { name: '2026', fiscalYear: 2026, items: [{ accountId: 'acc-4000', amount: 1000 }, { accountId: 'acc-5000', amount: 400 }] };

  test('create validates account types, duplicates, mixing and funds', async () => {
    prisma.ledgerAccount.findMany.mockResolvedValue([account('1000', 'ASSET')]);
    expect((await request(app).post('/api/v2/accounting/budgets').set(create).send({ ...input, items: [{ accountId: 'acc-1000', amount: 5 }] })).status).toBe(400);
    prisma.ledgerAccount.findMany.mockResolvedValue([account('4000', 'REVENUE')]);
    expect((await request(app).post('/api/v2/accounting/budgets').set(create).send({ ...input, items: [{ accountId: 'acc-4000', amount: 5 }, { accountId: 'acc-4000', amount: 6 }] })).status).toBe(400);
    expect((await request(app).post('/api/v2/accounting/budgets').set(create).send({ ...input, items: [{ accountId: 'acc-4000', amount: 5 }, { accountId: 'acc-4000', fundId: 'f1', amount: 6 }] })).status).toBe(400);
    prisma.fund.findMany.mockResolvedValue([]);
    expect((await request(app).post('/api/v2/accounting/budgets').set(create).send({ ...input, items: [{ accountId: 'acc-4000', fundId: 'ghost', amount: 5 }] })).status).toBe(400);
    expect(prisma.budget.create).not.toHaveBeenCalled();
  });

  test('approval needs a different person and only one approved budget per year', async () => {
    prisma.budget.findUnique.mockResolvedValue(budgetRow());
    expect((await request(app).post('/api/v2/accounting/budgets/b1/approve').set(as('finance:budget:approve'))).status).toBe(403);
    prisma.budget.findFirst.mockResolvedValue({ id: 'other' });
    expect((await request(app).post('/api/v2/accounting/budgets/b1/approve').set(asOther('finance:budget:approve'))).status).toBe(409);
    prisma.budget.findFirst.mockResolvedValue(null);
    prisma.budget.updateMany.mockResolvedValue({ count: 1 });
    expect((await request(app).post('/api/v2/accounting/budgets/b1/approve').set(asOther('finance:budget:approve'))).status).toBe(200);
    expect(prisma.budget.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'b1', status: 'DRAFT' }, data: { status: 'APPROVED', approvedBy: 'user-2' } });
  });

  test('only drafts can be edited', async () => {
    prisma.budget.findUnique.mockResolvedValue(budgetRow({ status: 'APPROVED' }));
    expect((await request(app).put('/api/v2/accounting/budgets/b1').set(create).send({ name: 'Renamed' })).status).toBe(409);
  });

  test('budget versus actual: favourable variances are positive, percentages are of the budget', async () => {
    prisma.budget.findUnique.mockResolvedValue(budgetRow({ status: 'APPROVED' }));
    prisma.journalLine.groupBy.mockResolvedValue([
      { accountId: 'acc-4000', fundId: 'f1', _sum: { debit: D('0'), credit: D('600.50') } },
      { accountId: 'acc-4000', fundId: null, _sum: { debit: D('10'), credit: D('300') } },
      { accountId: 'acc-5000', fundId: null, _sum: { debit: D('450'), credit: D('0') } },
    ]);
    const res = await request(app).get('/api/v2/accounting/budgets/b1/vs-actual').set(as('finance:view'));
    const [revenue, expense] = res.body.items;
    expect(revenue).toMatchObject({ budgeted: 1000, actual: 890.5, variance: -109.5, percentUsed: 89.1 });
    expect(expense).toMatchObject({ budgeted: 400, actual: 450, variance: -50, percentUsed: 112.5 });
    expect(res.body.totals).toMatchObject({ revenueBudgeted: 1000, revenueActual: 890.5, expenseActual: 450, surplusBudgeted: 600, surplusActual: 440.5 });
    const range = prisma.journalLine.groupBy.mock.calls[0][0].where.entry.postDate;
    expect(range.gte.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(range.lte.toISOString()).toBe('2026-12-31T23:59:59.999Z');
  });

  test('a fund-specific item only counts that fund', async () => {
    prisma.budget.findUnique.mockResolvedValue(budgetRow({ items: [{ id: 'i1', accountId: 'acc-4000', fundId: 'f1', amount: D('1000'), account: { code: '4000', name: 'Tithes', type: 'REVENUE' } }] }));
    prisma.journalLine.groupBy.mockResolvedValue([
      { accountId: 'acc-4000', fundId: 'f1', _sum: { debit: D('0'), credit: D('250') } },
      { accountId: 'acc-4000', fundId: 'f2', _sum: { debit: D('0'), credit: D('999') } },
    ]);
    const res = await request(app).get('/api/v2/accounting/budgets/b1/vs-actual').set(as('finance:view'));
    expect(res.body.items[0].actual).toBe(250);
  });
});

describe('funds and receipts', () => {
  const manage = as('finance:fund:manage');
  const fund = (over: Record<string, unknown> = {}) => ({ id: 'f1', churchId: 'church-1', accountId: 'fa', name: 'Building', description: null, isActive: true, isRestricted: false, ...over });

  test('list computes balances the same way as the dashboard', async () => {
    prisma.fund.findMany.mockResolvedValue([fund()]);
    prisma.receipt.groupBy.mockResolvedValue([{ fundId: 'f1', _sum: { amount: D('300.30') } }]);
    prisma.expenditure.groupBy.mockResolvedValue([{ fundId: 'f1', _sum: { amount: D('100.10') } }]);
    const res = await request(app).get('/api/v2/accounting/funds').set(as('finance:view'));
    expect(res.body[0]).toMatchObject({ totalReceived: 300.3, totalSpent: 100.1, balance: 200.2 });
    expect(prisma.receipt.groupBy.mock.calls[0][0].where).toEqual({ churchId: 'church-1', status: { not: 'VOIDED' } });
  });

  test('create makes the finance account if needed and rejects duplicate names', async () => {
    prisma.financialAccount.findUnique.mockResolvedValue(null);
    prisma.financialAccount.create.mockResolvedValue({ id: 'fa' });
    prisma.fund.create.mockResolvedValue(fund());
    expect((await request(app).post('/api/v2/accounting/funds').set(manage).send({ name: 'Building', isRestricted: true })).status).toBe(201);
    expect(prisma.fund.create.mock.calls[0][0].data).toMatchObject({ churchId: 'church-1', accountId: 'fa', isRestricted: true });
    prisma.fund.create.mockRejectedValue(P2002('churchId_name'));
    expect((await request(app).post('/api/v2/accounting/funds').set(manage).send({ name: 'Building' })).status).toBe(409);
  });

  test('a fund holding money cannot be deactivated', async () => {
    prisma.fund.findUnique.mockResolvedValue(fund());
    prisma.fund.findMany.mockResolvedValue([fund()]);
    prisma.receipt.groupBy.mockResolvedValue([{ fundId: 'f1', _sum: { amount: D('50') } }]);
    prisma.expenditure.groupBy.mockResolvedValue([]);
    expect((await request(app).put('/api/v2/accounting/funds/f1').set(manage).send({ isActive: false })).status).toBe(409);
    expect(prisma.fund.update).not.toHaveBeenCalled();
  });

  test('inactive funds no longer accept receipts, and unknown funds are rejected', async () => {
    const post = () => request(app).post('/api/v2/churches/church-1/receipts').set(as('finance:receipt:create')).send({ fundId: 'f1', incomeType: 'TITHE', amount: 10, paymentMethod: 'CASH' });
    prisma.church.findUnique.mockResolvedValue({ id: 'church-1' });
    prisma.fund.findFirst.mockResolvedValue(null);
    expect((await post()).status).toBe(404);
    prisma.fund.findFirst.mockResolvedValue(fund({ isActive: false }));
    const res = await post();
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inactive/);
    expect(prisma.receipt.create).not.toHaveBeenCalled();
  });

  describe('voiding a receipt', () => {
    const voider = as('finance:journal:reverse');
    const receipt = (over: Record<string, unknown> = {}) => ({ id: 'r1', churchId: 'church-1', status: 'ISSUED', receiptNumber: 'CH-1', amount: D('10'), ...over });

    test('needs a reason and the reverse permission', async () => {
      expect((await request(app).post('/api/v2/accounting/receipts/r1/void').set(as('finance:view')).send({ reason: 'x' })).status).toBe(403);
      expect((await request(app).post('/api/v2/accounting/receipts/r1/void').set(voider).send({})).status).toBe(400);
    });

    test('voids an issued receipt and audits the reason', async () => {
      prisma.receipt.findUnique.mockResolvedValue(receipt());
      prisma.payment.findFirst.mockResolvedValue(null);
      prisma.receipt.updateMany.mockResolvedValue({ count: 1 });
      const res = await request(app).post('/api/v2/accounting/receipts/r1/void').set(voider).send({ reason: 'Entered twice' });
      expect(res.body).toEqual({ id: 'r1', status: 'VOIDED' });
      expect(prisma.receipt.updateMany.mock.calls[0][0]).toEqual({ where: { id: 'r1', status: 'ISSUED' }, data: { status: 'VOIDED' } });
      expect(JSON.parse(prisma.auditLog.create.mock.calls[0][0].data.changes).reason).toBe('Entered twice');
    });

    test('online-payment receipts, already voided receipts and foreign receipts are refused', async () => {
      prisma.receipt.findUnique.mockResolvedValue(receipt());
      prisma.payment.findFirst.mockResolvedValue({ id: 'pay-1' });
      expect((await request(app).post('/api/v2/accounting/receipts/r1/void').set(voider).send({ reason: 'x' })).status).toBe(409);
      prisma.receipt.findUnique.mockResolvedValue(receipt({ status: 'VOIDED' }));
      expect((await request(app).post('/api/v2/accounting/receipts/r1/void').set(voider).send({ reason: 'x' })).status).toBe(409);
      prisma.receipt.findUnique.mockResolvedValue(receipt({ churchId: 'church-2' }));
      expect((await request(app).post('/api/v2/accounting/receipts/r1/void').set(voider).send({ reason: 'x' })).status).toBe(404);
    });
  });
});

describe('cash sessions', () => {
  const manage = as('finance:cash_session:manage');
  const session = (over: Record<string, unknown> = {}) => ({
    id: 'cs1', churchId: 'church-1', accountId: 'fa', status: 'OPEN', sessionDate: new Date('2026-03-01T08:00:00Z'), handledBy: 'member-1', openingBalance: D('100'),
    closingBalance: null, closedAt: null, cashPaidOut: null, expectedClosing: null, variance: null, notes: null, ...over,
  });

  test('opening needs a member-linked account and only one session at a time', async () => {
    expect((await request(app).post('/api/v2/accounting/cash-sessions').set(user('user-1', null, 'finance:cash_session:manage')).send({ openingBalance: 50 })).status).toBe(403);
    prisma.cashSession.findFirst.mockResolvedValue(session());
    expect((await request(app).post('/api/v2/accounting/cash-sessions').set(manage).send({ openingBalance: 50 })).status).toBe(409);
    prisma.cashSession.findFirst.mockResolvedValue(null);
    prisma.financialAccount.findUnique.mockResolvedValue({ id: 'fa' });
    prisma.cashSession.create.mockResolvedValue(session());
    const ok = await request(app).post('/api/v2/accounting/cash-sessions').set(manage).send({ openingBalance: 100 });
    expect(ok.status).toBe(201);
    expect(prisma.cashSession.create.mock.calls[0][0].data).toMatchObject({ churchId: 'church-1', handledBy: 'member-1', status: 'OPEN' });
  });

  test('closing a session that adds up needs no notes and records the expected total', async () => {
    prisma.cashSession.findUnique.mockResolvedValueOnce(session()).mockResolvedValue(session({ status: 'CLOSED', closingBalance: D('155.5'), expectedClosing: D('155.5'), variance: D('0') }));
    prisma.receipt.aggregate.mockResolvedValue({ _sum: { amount: D('75.50') } });
    prisma.cashSession.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app).post('/api/v2/accounting/cash-sessions/cs1/close').set(manage).send({ countedBalance: 155.5, cashPaidOut: 20 });
    expect(res.status).toBe(200);
    expect(prisma.cashSession.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'cs1', status: 'OPEN' }, data: { status: 'CLOSED', expectedClosing: D('155.5'), variance: D('0'), closedBy: 'user-1' } });
    const where = prisma.receipt.aggregate.mock.calls[0][0].where;
    expect(where).toMatchObject({ churchId: 'church-1', status: 'ISSUED', paymentMethod: 'CASH' });
  });

  test('a shortage or surplus must be explained', async () => {
    prisma.cashSession.findUnique.mockResolvedValue(session());
    prisma.receipt.aggregate.mockResolvedValue({ _sum: { amount: D('50') } });
    const res = await request(app).post('/api/v2/accounting/cash-sessions/cs1/close').set(manage).send({ countedBalance: 140 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/short by 10\.00/);
    expect(prisma.cashSession.updateMany).not.toHaveBeenCalled();
    prisma.cashSession.updateMany.mockResolvedValue({ count: 1 });
    expect((await request(app).post('/api/v2/accounting/cash-sessions/cs1/close').set(manage).send({ countedBalance: 140, notes: 'Coins given as change' })).status).toBe(200);
    expect(prisma.cashSession.updateMany.mock.calls[0][0].data.variance).toEqual(D(-10));
  });

  test('closed or foreign sessions cannot be closed', async () => {
    prisma.cashSession.findUnique.mockResolvedValue(session({ status: 'CLOSED' }));
    expect((await request(app).post('/api/v2/accounting/cash-sessions/cs1/close').set(manage).send({ countedBalance: 1 })).status).toBe(409);
    prisma.cashSession.findUnique.mockResolvedValue(session({ churchId: 'church-2' }));
    expect((await request(app).post('/api/v2/accounting/cash-sessions/cs1/close').set(manage).send({ countedBalance: 1 })).status).toBe(404);
  });
});
