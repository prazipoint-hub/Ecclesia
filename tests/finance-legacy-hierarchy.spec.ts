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
import { districtFinanceService } from '@/features/finance/district/service';

const prisma = mocked.prisma as ReturnType<typeof createMockPrisma>;
const app = createApp();

const CIR = '11111111-1111-4111-8111-111111111111';
const EXP = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const as = (...permissions: string[]) => ({
  Authorization: `Bearer ${jwt.sign({ sub: USER, email: 'u@example.com', churchId: 'church-1', memberId: 'member-1', permissions, sessionId: 's1', tokenId: 't1' }, jwtSecret, { expiresIn: '5m' })}`,
});
const user = (...permissions: string[]) => ({ id: USER, churchId: 'church-1', permissions, memberId: 'member-1' });
const actions = () => prisma.auditLog.create.mock.calls.map((c) => c[0].data.action);

beforeEach(() => {
  vi.resetAllMocks();
  prisma.expenditureApproval.findMany.mockResolvedValue([]);
  prisma.expenditureApproval.create.mockResolvedValue({});
  prisma.systemSetting.findUnique.mockResolvedValue(null);
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.auditLog.create.mockResolvedValue({});
  prisma.circuit.findUnique.mockResolvedValue({ id: CIR, name: 'North' });
  prisma.church.findUnique.mockResolvedValue({ circuitId: CIR }); // the signed-in user's church sits in this circuit
  prisma.scopedRoleAssignment.findMany.mockResolvedValue([]);
});

// Circuit and district finance share one design (and nearly one body of code); the same scenarios run against both.
// Circuits have no church of their own, so there is no church-ownership check to test: access is by permission only.
const suites = [
  {
    name: 'circuit',
    base: `/api/v2/circuits/${CIR}`,
    perms: { view: 'circuit_finance:view', receipt: 'circuit_receipt:create', create: 'circuit_expenditure:create', approve: 'circuit_expenditure:approve', pay: 'circuit_payment:create' },
    receipts: () => prisma.circuitReceipt,
    exps: () => prisma.circuitExpenditure,
    account: () => prisma.circuitFinancialAccount,
    prefix: 'CIR',
    audit: 'CIRCUIT',
    entity: 'CIRCUIT_FINANCE',
    notFound: 'Circuit not found',
  },
];

describe.each(suites)('$name finance', (s) => {
  const wire = (opening: number, income = 0, committed = 0) => {
    s.account().findUnique.mockResolvedValue({ circuitId: CIR, openingBalance: opening });
    s.receipts().aggregate.mockResolvedValue({ _sum: { amount: income } });
    s.exps().aggregate.mockResolvedValue({ _sum: { amount: committed } });
  };
  const exp = (over: Record<string, unknown> = {}) => ({ id: EXP, circuitId: CIR, amount: 40, status: 'SUBMITTED', requestedBy: 'treasurer', ...over });

  describe('route permissions', () => {
    const routes = (): Array<[string, string, string]> => [
      ['get', '/dashboard', s.perms.view],
      ['post', '/receipts', s.perms.receipt],
      ['post', '/expenditures', s.perms.create],
      ['get', '/expenditures/pending', s.perms.approve],
      ['post', `/expenditures/${EXP}/approve`, s.perms.approve],
      ['post', `/expenditures/${EXP}/pay`, s.perms.pay],
    ];
    test('every route needs sign-in and its own permission', async () => {
      for (const [method, path, permission] of routes()) {
        expect((await (request(app) as any)[method](s.base + path)).status, `${method} ${path} anonymous`).toBe(401);
        const wrong = await (request(app) as any)[method](s.base + path).set(as('finance:view'));
        expect(wrong.status, `${method} ${path} wrong permission`).toBe(403);
        expect(wrong.body.error).toContain(permission);
      }
    });
  });

  describe('dashboard', () => {
    test('summary counts approved and paid spending and skips voided receipts', async () => {
      wire(500, 300, 120);
      for (const m of [s.receipts(), s.exps()]) { m.findMany.mockResolvedValue([]); m.count.mockResolvedValue(0); }
      const res = await request(app).get(`${s.base}/dashboard`).set(as(s.perms.view));
      expect(res.status).toBe(200);
      expect(res.body.summary).toEqual({ openingBalance: 500, totalIncome: 300, totalExpense: 120, currentBalance: 680 });
      expect(s.receipts().aggregate.mock.calls[0][0].where).toEqual({ circuitId: CIR, status: { not: 'VOIDED' } });
      expect(s.exps().aggregate.mock.calls[0][0].where).toEqual({ circuitId: CIR, status: { in: ['APPROVED', 'PAID'] } });
      expect(s.exps().findMany.mock.calls[0][0].where).toEqual({ circuitId: CIR, status: 'SUBMITTED' });
    });

    test('unknown unit is 404', async () => {
      prisma.circuit.findUnique.mockResolvedValue(null);
      expect((await request(app).get(`${s.base}/dashboard`).set(as(s.perms.view))).status).toBe(404);
    });
  });

  describe('receipts', () => {
    const body = { incomeType: 'TRANSFER', amount: 75, paymentMethod: 'BANK_TRANSFER' };
    const post = (payload: unknown = body) => request(app).post(`${s.base}/receipts`).set(as(s.perms.receipt)).send(payload as object);
    beforeEach(() => {
      s.account().findUnique.mockResolvedValue({ circuitId: CIR });
      prisma.$transaction.mockImplementation((async (fn: any) => fn(prisma)) as never);
      prisma.receiptSequence.upsert.mockResolvedValue({ last: 10 });
      s.receipts().create.mockImplementation((async ({ data }: any) => data) as never);
    });

    test.each([
      ['zero amount', { ...body, amount: 0 }],
      ['unknown income type', { ...body, incomeType: 'LOTTERY' }],
      ['unknown payment method', { ...body, paymentMethod: 'BARTER' }],
      ['empty member id', { ...body, memberId: '' }],
      ['more than two decimal places', { ...body, amount: 10.001 }],
    ])('rejects %s', async (_n, payload) => {
      expect((await post(payload)).status).toBe(400);
      expect(s.receipts().create).not.toHaveBeenCalled();
    });

    test('issues a numbered receipt for this unit and audits it', async () => {
      const res = await post({ ...body, reference: 'REF1', description: 'from church' });
      expect(res.status).toBe(201);
      const data = s.receipts().create.mock.calls[0][0].data;
      expect(data).toMatchObject({ circuitId: CIR, status: 'ISSUED', issuedBy: USER, amount: 75, reference: 'REF1', description: 'from church' });
      expect(data.receiptNumber).toBe(`${s.prefix}-${new Date().getFullYear()}-000010`);
      expect(prisma.receiptSequence.upsert.mock.calls[0][0].where.churchId_year.churchId).toBe(`GLOBAL:${s.prefix}`);
      expect(actions()).toEqual([`${s.audit}_RECEIPT_CREATED`]);
      expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ entityType: s.entity, entityId: CIR, churchId: 'church-1', actorId: USER });
    });

    test('path unit wins over the body; first receipt creates the account', async () => {
      s.account().findUnique.mockResolvedValue(null);
      s.account().create.mockResolvedValue({});
      await post({ ...body, circuitId: '44444444-4444-4444-8444-444444444444' });
      expect(s.receipts().create.mock.calls[0][0].data.circuitId).toBe(CIR);
      expect(s.account().create.mock.calls[0][0].data).toMatchObject({ circuitId: CIR, openingBalance: 0, status: 'ACTIVE' });
    });

    test('unknown unit is refused and nothing is issued', async () => {
      prisma.circuit.findUnique.mockResolvedValue(null);
      expect((await post()).status).toBe(403);
      expect(s.receipts().create).not.toHaveBeenCalled();
    });

    test('accepts cents', async () => {
      expect((await post({ ...body, amount: 10.1 })).status).toBe(201);
    });
  });

  describe('expenditure requests', () => {
    const body = { amount: 40, purpose: 'Van repairs', expenseCategory: 'TRANSPORT' };
    const post = (payload: unknown = body) => request(app).post(`${s.base}/expenditures`).set(as(s.perms.create)).send(payload as object);
    beforeEach(() => {
      wire(100);
      s.exps().create.mockImplementation((async ({ data }: any) => data) as never);
    });

    test.each([
      ['zero amount', { ...body, amount: 0 }],
      ['empty purpose', { ...body, purpose: '' }],
      ['more than two decimal places', { ...body, amount: 5.005 }],
    ])('rejects %s', async (_n, payload) => {
      expect((await post(payload)).status).toBe(400);
      expect(s.exps().create).not.toHaveBeenCalled();
    });

    test('submits for approval and audits', async () => {
      const res = await post({ ...body, description: 'urgent', attachments: ['a.pdf'] });
      expect(res.status).toBe(201);
      expect(s.exps().create.mock.calls[0][0].data).toMatchObject({ circuitId: CIR, status: 'SUBMITTED', amount: 40, description: 'urgent', attachments: ['a.pdf'], requestedBy: 'member-1' });
      expect(actions()).toEqual([`${s.audit}_EXPENDITURE_REQUESTED`]);
    });

    test('committed spending counts; the exact remaining balance is allowed, a cent more is not', async () => {
      wire(100, 0, 70);
      expect((await post({ ...body, amount: 30 })).status).toBe(201);
      s.exps().create.mockClear();
      const over = await post({ ...body, amount: 30.01 });
      expect(s.exps().create).not.toHaveBeenCalled();
      expect(over.body.error).toContain('Insufficient');
    });

    test('unknown unit is refused and nothing is created', async () => {
      prisma.circuit.findUnique.mockResolvedValue(null);
      expect((await post()).status).toBe(403);
      expect(s.exps().create).not.toHaveBeenCalled();
    });

      test('insufficient balance is refused as a conflict', async () => {
      const res = await post({ ...body, amount: 9999 });
      expect(res.status).toBe(409);
      expect(s.exps().create).not.toHaveBeenCalled();
    });

    test('the requester is the signed-in user, whatever the body says', async () => {
      await post({ ...body, requestedBy: '55555555-5555-4555-8555-555555555555' });
      expect(s.exps().create.mock.calls[0][0].data.requestedBy).toBe('member-1');
    });
  });

  describe('pending list', () => {
    test('submitted items for this unit only, with paging', async () => {
      s.exps().findMany.mockResolvedValue([exp()]);
      s.exps().count.mockResolvedValue(1);
      const res = await request(app).get(`${s.base}/expenditures/pending?skip=1&take=4`).set(as(s.perms.approve));
      expect(res.body).toMatchObject({ circuitId: CIR, total: 1, skip: 1, take: 4 });
      expect(s.exps().findMany.mock.calls[0][0]).toMatchObject({ where: { circuitId: CIR, status: 'SUBMITTED' }, skip: 1, take: 4 });
    });
    test.each(['?take=abc', '?take=0', '?take=101', '?skip=-1'])('rejects paging %s', async (q) => {
      expect((await request(app).get(`${s.base}/expenditures/pending${q}`).set(as(s.perms.approve))).status).toBe(400);
      expect(s.exps().findMany).not.toHaveBeenCalled();
    });
    test('unknown unit is 404', async () => {
      prisma.circuit.findUnique.mockResolvedValue(null);
      expect((await request(app).get(`${s.base}/expenditures/pending`).set(as(s.perms.approve))).status).toBe(404);
    });
  });

  describe('approval', () => {
    const approve = (payload: unknown = { approved: true }) => request(app).post(`${s.base}/expenditures/${EXP}/approve`).set(as(s.perms.approve)).send(payload as object);
    beforeEach(() => {
      s.exps().findUnique.mockResolvedValue(exp());
      s.exps().updateMany.mockResolvedValue({ count: 1 });
    });

    test('approves with notes and audits', async () => {
      const res = await approve({ approved: true, approverNotes: 'ok' });
      expect(res.status).toBe(200);
      expect(s.exps().updateMany.mock.calls[0][0]).toMatchObject({ where: { id: EXP, status: 'SUBMITTED', circuitId: CIR }, data: { status: 'APPROVED', approvedBy: USER, approverNotes: 'ok' } });
      expect(actions()).toEqual([`${s.audit}_EXPENDITURE_APPROVED`]);
    });
    test('rejects', async () => {
      await approve({ approved: false });
      expect(s.exps().updateMany.mock.calls[0][0].data.status).toBe('REJECTED');
      expect(actions()).toEqual([`${s.audit}_EXPENDITURE_REJECTED`]);
    });
    test('approved flag required; unknown item 404', async () => {
      expect((await approve({})).status).toBe(400);
      s.exps().findUnique.mockResolvedValue(null);
      expect((await approve()).status).toBe(404);
      expect(s.exps().updateMany).not.toHaveBeenCalled();
    });
    test.each(['APPROVED', 'REJECTED', 'PAID'])('an expenditure that is %s cannot be decided again', async (status) => {
      s.exps().findUnique.mockResolvedValue(exp({ status }));
      expect((await approve()).body.error).toContain(`status is ${status}`);
      expect(s.exps().updateMany).not.toHaveBeenCalled();
    });
    test('an expenditure of another unit is untouched', async () => {
      s.exps().findUnique.mockResolvedValue(exp({ circuitId: 'other' }));
      expect((await approve()).status).toBe(400);
      expect(s.exps().updateMany).not.toHaveBeenCalled();
    });
    test('a repeated decision is a conflict', async () => {
      s.exps().findUnique.mockResolvedValue(exp({ status: 'PAID' }));
      expect((await approve()).status).toBe(409);
      expect(s.exps().updateMany).not.toHaveBeenCalled();
    });
    test.each([USER, 'member-1'])('the requester (stored as %s) cannot approve their own request, but may reject it', async (who) => {
      s.exps().findUnique.mockResolvedValue(exp({ requestedBy: who }));
      const res = await approve();
      expect(res.status).toBe(409);
      expect(res.body.error).toContain('your own request');
      expect(s.exps().updateMany).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
      expect((await approve({ approved: false })).status).toBe(200);
    });
    test('losing the race to another approver changes nothing and writes no audit entry', async () => {
      s.exps().updateMany.mockResolvedValue({ count: 0 });
      expect((await approve()).status).toBe(409);
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
    test('a non-boolean approved value is rejected', async () => {
      for (const approved of ['false', 'true', 0, 1, null]) expect((await approve({ approved }) ).status, String(approved)).toBe(400);
      expect(s.exps().updateMany).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('payment', () => {
    const pay = (payload: unknown = { paymentMethod: 'CASH' }) => request(app).post(`${s.base}/expenditures/${EXP}/pay`).set(as(s.perms.pay)).send(payload as object);
    beforeEach(() => {
      s.exps().findUnique.mockResolvedValue(exp({ status: 'APPROVED' }));
      s.exps().updateMany.mockResolvedValue({ count: 1 });
    });
    test('pays an approved item and audits', async () => {
      expect((await pay()).status).toBe(200);
      expect(s.exps().updateMany.mock.calls[0][0]).toMatchObject({ where: { id: EXP, status: 'APPROVED', circuitId: CIR }, data: { status: 'PAID', paymentMethod: 'CASH' } });
      expect(actions()).toEqual([`${s.audit}_EXPENDITURE_PAID`]);
    });
    test('method required; unknown item 404', async () => {
      expect((await pay({})).status).toBe(400);
      s.exps().findUnique.mockResolvedValue(null);
      expect((await pay()).status).toBe(404);
    });
    test.each(['SUBMITTED', 'REJECTED', 'PAID'])('an expenditure that is %s cannot be paid', async (status) => {
      s.exps().findUnique.mockResolvedValue(exp({ status }));
      await pay();
      expect(s.exps().updateMany).not.toHaveBeenCalled();
    });
    test('an expenditure of another unit is untouched', async () => {
      s.exps().findUnique.mockResolvedValue(exp({ status: 'APPROVED', circuitId: 'other' }));
      expect((await pay()).status).toBe(400);
      expect(s.exps().updateMany).not.toHaveBeenCalled();
    });
    test('losing the race to another payment changes nothing and writes no audit entry', async () => {
      s.exps().updateMany.mockResolvedValue({ count: 0 });
      expect((await pay()).status).toBe(409);
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });
});

// ------------------------------------------------------------------ district
// The district module is a copy of the circuit one built on the Circuit table. Its routes are mounted at
// /api/v2/districts/:districtId but its controller reads req.params.circuitId, so over HTTP the id never arrives.
describe('district finance over HTTP', () => {
  const D = '66666666-6666-4666-8666-666666666666';
  beforeEach(() => { prisma.church.findUnique.mockResolvedValue({ circuitId: D }); });
  const root = `/api/v2/districts/${D}/finance`;

  test('every route still needs sign-in and its permission', async () => {
    const routes: Array<[string, string, string]> = [
      ['get', '/dashboard', 'district_finance:view'], ['post', '/receipts', 'district_receipt:create'], ['post', '/expenditures', 'district_expenditure:create'],
      ['get', '/expenditures/pending', 'district_expenditure:approve'], ['post', `/expenditures/${EXP}/approve`, 'district_expenditure:approve'], ['post', `/expenditures/${EXP}/pay`, 'district_payment:create'],
    ];
    for (const [method, path, permission] of routes) {
      expect((await (request(app) as any)[method](`${root}${path}`)).status).toBe(401);
      const wrong = await (request(app) as any)[method](`${root}${path}`).set(as('finance:view'));
      expect(wrong.status).toBe(403);
      expect(wrong.body.error).toContain(permission);
    }
  });

  // Regression: the controller used to read req.params.circuitId while the route param is :districtId.
  test('the dashboard looks up the unit named in the URL', async () => {
    prisma.districtFinancialAccount.findUnique.mockResolvedValue({ openingBalance: 0 });
    for (const m of [prisma.districtReceipt, prisma.districtExpenditure]) { m.aggregate.mockResolvedValue({ _sum: { amount: 0 } }); m.findMany.mockResolvedValue([]); m.count.mockResolvedValue(0); }
    const res = await request(app).get(`${root}/dashboard`).set(as('district_finance:view'));
    expect(res.status).toBe(200);
    expect(prisma.circuit.findUnique.mock.calls[0][0].where).toEqual({ id: D });
    expect(prisma.districtReceipt.aggregate.mock.calls[0][0].where.circuitId).toBe(D);
  });
  test('a receipt can be created over HTTP, scoped to the unit in the URL', async () => {
    prisma.districtFinancialAccount.findUnique.mockResolvedValue({});
    prisma.$transaction.mockImplementation((async (fn: any) => fn(prisma)) as never);
    prisma.receiptSequence.upsert.mockResolvedValue({ last: 1 });
    prisma.districtReceipt.create.mockImplementation((async ({ data }: any) => data) as never);
    const res = await request(app).post(`${root}/receipts`).set(as('district_receipt:create')).send({ incomeType: 'TRANSFER', amount: 5, paymentMethod: 'CASH' });
    expect(res.status).toBe(201);
    expect(prisma.districtReceipt.create.mock.calls[0][0].data).toMatchObject({ circuitId: D, status: 'ISSUED', issuedBy: USER });
  });
  test('approve, pay and pending also use the unit in the URL', async () => {
    prisma.districtExpenditure.findUnique.mockResolvedValue({ id: EXP, circuitId: D, amount: 5, status: 'SUBMITTED', requestedBy: 'x' });
    prisma.districtExpenditure.updateMany.mockResolvedValue({ count: 1 });
    expect((await request(app).post(`${root}/expenditures/${EXP}/approve`).set(as('district_expenditure:approve')).send({ approved: true })).status).toBe(200);
    prisma.districtExpenditure.findUnique.mockResolvedValue({ id: EXP, circuitId: 'other', amount: 5, status: 'APPROVED', requestedBy: 'x' });
    prisma.districtExpenditure.updateMany.mockClear();
    expect((await request(app).post(`${root}/expenditures/${EXP}/pay`).set(as('district_payment:create')).send({ paymentMethod: 'CASH' })).status).toBe(400);
    expect(prisma.districtExpenditure.updateMany).not.toHaveBeenCalled();
    prisma.districtExpenditure.findMany.mockResolvedValue([]);
    prisma.districtExpenditure.count.mockResolvedValue(0);
    await request(app).get(`${root}/expenditures/pending`).set(as('district_expenditure:approve'));
    expect(prisma.districtExpenditure.findMany.mock.calls[0][0].where).toEqual({ circuitId: D, status: 'SUBMITTED' });
    for (const q of ['?take=abc', '?take=101', '?skip=-1']) {
      prisma.districtExpenditure.findMany.mockClear();
      expect((await request(app).get(`${root}/expenditures/pending${q}`).set(as('district_expenditure:approve'))).status).toBe(400);
      expect(prisma.districtExpenditure.findMany).not.toHaveBeenCalled();
    }
  });
});

describe('district finance service (called directly, since the HTTP layer cannot pass the id)', () => {
  beforeEach(() => { prisma.church.findUnique.mockResolvedValue({ circuitId: CIR }); });
  const svc = districtFinanceService;
  const u = user('district_finance:view', 'district_receipt:create', 'district_expenditure:create', 'district_expenditure:approve', 'district_payment:create');
  const wire = (opening: number, income = 0, committed = 0) => {
    prisma.districtFinancialAccount.findUnique.mockResolvedValue({ circuitId: CIR, openingBalance: opening });
    prisma.districtReceipt.aggregate.mockResolvedValue({ _sum: { amount: income } });
    prisma.districtExpenditure.aggregate.mockResolvedValue({ _sum: { amount: committed } });
  };
  const exp = (over: Record<string, unknown> = {}) => ({ id: EXP, circuitId: CIR, amount: 40, status: 'SUBMITTED', requestedBy: 'treasurer', ...over });

  test('dashboard needs the permission and a real unit, and sums correctly', async () => {
    wire(100, 50, 20);
    for (const m of [prisma.districtReceipt, prisma.districtExpenditure]) { m.findMany.mockResolvedValue([]); m.count.mockResolvedValue(0); }
    const out = await svc.getDistrictFinanceDashboard(CIR, u);
    expect(out.summary).toEqual({ openingBalance: 100, totalIncome: 50, totalExpense: 20, currentBalance: 130 });
    expect(prisma.districtReceipt.aggregate.mock.calls[0][0].where).toEqual({ circuitId: CIR, status: { not: 'VOIDED' } });
    expect(prisma.districtExpenditure.aggregate.mock.calls[0][0].where).toEqual({ circuitId: CIR, status: { in: ['APPROVED', 'PAID'] } });
    await expect(svc.getDistrictFinanceDashboard(CIR, user())).rejects.toThrow(/district_finance:view/);
    prisma.circuit.findUnique.mockResolvedValue(null);
    await expect(svc.getDistrictFinanceDashboard(CIR, u)).rejects.toThrow(/not found/);
  });

  test('receipt: numbered, scoped, audited; first receipt creates the account', async () => {
    prisma.districtFinancialAccount.findUnique.mockResolvedValue(null);
    prisma.districtFinancialAccount.create.mockResolvedValue({});
    prisma.$transaction.mockImplementation((async (fn: any) => fn(prisma)) as never);
    prisma.receiptSequence.upsert.mockResolvedValue({ last: 1 });
    prisma.districtReceipt.create.mockImplementation((async ({ data }: any) => data) as never);
    const r: any = await svc.createDistrictReceipt({ circuitId: CIR, incomeType: 'TRANSFER', amount: 12, currency: 'USD', paymentMethod: 'CASH' }, u);
    expect(r).toMatchObject({ circuitId: CIR, status: 'ISSUED', issuedBy: USER });
    expect(r.receiptNumber).toMatch(/-\d{4}-000001$/);
    expect(prisma.districtFinancialAccount.create).toHaveBeenCalled();
    expect(actions()).toHaveLength(1);
    await expect(svc.createDistrictReceipt({ circuitId: CIR, incomeType: 'TRANSFER', amount: 1, currency: 'USD', paymentMethod: 'CASH' }, user())).rejects.toThrow(/district_receipt:create/);
  });

  test('expenditure request: balance rule and audit', async () => {
    wire(100, 0, 70);
    prisma.districtExpenditure.create.mockImplementation((async ({ data }: any) => data) as never);
    const ok: any = await svc.createDistrictExpenditure({ circuitId: CIR, amount: 30, purpose: 'x', expenseCategory: 'c' }, u);
    expect(ok.status).toBe('SUBMITTED');
    await expect(svc.createDistrictExpenditure({ circuitId: CIR, amount: 30.01, purpose: 'x', expenseCategory: 'c' }, u)).rejects.toThrow(/Insufficient/);
    expect(prisma.districtExpenditure.create).toHaveBeenCalledTimes(1);
    await expect(svc.createDistrictExpenditure({ circuitId: CIR, amount: 1, purpose: 'x', expenseCategory: 'c' }, user())).rejects.toThrow(/district_expenditure:create/);
  });

  test('pending list is scoped and permission checked', async () => {
    prisma.districtExpenditure.findMany.mockResolvedValue([exp()]);
    prisma.districtExpenditure.count.mockResolvedValue(1);
    const out = await svc.listPendingExpenditures(CIR, u, { skip: 2, take: 5 });
    expect(out).toMatchObject({ circuitId: CIR, total: 1, skip: 2, take: 5 });
    expect(prisma.districtExpenditure.findMany.mock.calls[0][0].where).toEqual({ circuitId: CIR, status: 'SUBMITTED' });
    await expect(svc.listPendingExpenditures(CIR, user())).rejects.toThrow(/district_expenditure:approve/);
    prisma.circuit.findUnique.mockResolvedValue(null);
    await expect(svc.listPendingExpenditures(CIR, u)).rejects.toThrow(/not found/);
  });

  test('approval: state machine, scope, audit', async () => {
    prisma.districtExpenditure.updateMany.mockResolvedValue({ count: 1 });
    // each call reads the row, claims it, then reads the updated row back
    prisma.districtExpenditure.findUnique.mockResolvedValueOnce(exp()).mockResolvedValueOnce(exp({ status: 'APPROVED' }));
    const approved: any = await svc.approveDistrictExpenditure(EXP, true, 'ok', u, CIR);
    expect(approved.status).toBe('APPROVED');
    expect(prisma.districtExpenditure.updateMany.mock.calls[0][0].where).toEqual({ id: EXP, status: 'SUBMITTED', circuitId: CIR });
    expect(actions()).toEqual(['DISTRICT_EXPENDITURE_APPROVED']);
    prisma.districtExpenditure.findUnique.mockResolvedValueOnce(exp()).mockResolvedValueOnce(exp({ status: 'REJECTED' }));
    const rejected: any = await svc.approveDistrictExpenditure(EXP, false, undefined, u, CIR);
    expect(rejected.status).toBe('REJECTED');
    prisma.districtExpenditure.updateMany.mockClear();
    prisma.districtExpenditure.findUnique.mockResolvedValue(exp({ status: 'PAID' }));
    await expect(svc.approveDistrictExpenditure(EXP, true, undefined, u, CIR)).rejects.toThrow(/status is PAID/);
    prisma.districtExpenditure.findUnique.mockResolvedValue(exp({ circuitId: 'other' }));
    await expect(svc.approveDistrictExpenditure(EXP, true, undefined, u, CIR)).rejects.toThrow(/does not belong/);
    prisma.districtExpenditure.findUnique.mockResolvedValue(null);
    await expect(svc.approveDistrictExpenditure(EXP, true, undefined, u, CIR)).rejects.toThrow(/not found/);
    prisma.districtExpenditure.findUnique.mockResolvedValue(exp());
    await expect(svc.approveDistrictExpenditure(EXP, true, undefined, user(), CIR)).rejects.toThrow(/district_expenditure:approve/);
    expect(prisma.districtExpenditure.updateMany).not.toHaveBeenCalled();
  });

  test('payment: only approved items, scoped, audited', async () => {
    prisma.districtExpenditure.updateMany.mockResolvedValue({ count: 1 });
    prisma.districtExpenditure.findUnique.mockResolvedValueOnce(exp({ status: 'APPROVED' })).mockResolvedValueOnce(exp({ status: 'PAID', paymentMethod: 'CASH' }));
    const paid: any = await svc.paymentDistrictExpenditure(EXP, 'CASH', u, CIR);
    expect(paid).toMatchObject({ status: 'PAID', paymentMethod: 'CASH' });
    expect(actions()).toEqual(['DISTRICT_EXPENDITURE_PAID']);
    prisma.districtExpenditure.updateMany.mockClear();
    prisma.districtExpenditure.findUnique.mockResolvedValue(exp({ status: 'SUBMITTED' }));
    await expect(svc.paymentDistrictExpenditure(EXP, 'CASH', u, CIR)).rejects.toThrow(/approved/);
    prisma.districtExpenditure.findUnique.mockResolvedValue(exp({ status: 'APPROVED', circuitId: 'other' }));
    await expect(svc.paymentDistrictExpenditure(EXP, 'CASH', u, CIR)).rejects.toThrow(/does not belong/);
    prisma.districtExpenditure.findUnique.mockResolvedValue(exp({ status: 'APPROVED' }));
    await expect(svc.paymentDistrictExpenditure(EXP, 'CASH', user(), CIR)).rejects.toThrow(/district_payment:create/);
    expect(prisma.districtExpenditure.updateMany).not.toHaveBeenCalled();
  });
});
