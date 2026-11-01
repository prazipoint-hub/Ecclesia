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
const base = '/api/v2/churches/church-1';

const as = (...permissions: string[]) => ({
  Authorization: `Bearer ${jwt.sign({ sub: 'user-1', email: 'u@example.com', churchId: 'church-1', memberId: 'member-1', permissions, sessionId: 's1', tokenId: 't1' }, jwtSecret, { expiresIn: '5m' })}`,
});
const church = (id = 'church-1') => ({ id, name: 'Grace' });
const fund = (over: Record<string, unknown> = {}) => ({ id: 'fund-1', churchId: 'church-1', isActive: true, ...over });
const exp = (over: Record<string, unknown> = {}) => ({ id: 'e1', churchId: 'church-1', amount: 40, status: 'SUBMITTED', requestedBy: 'treasurer', ...over });
const actions = () => prisma.auditLog.create.mock.calls.map((c) => c[0].data.action);

function balance(opening: number, income = 0, committed = 0) {
  prisma.financialAccount.findUnique.mockResolvedValue({ churchId: 'church-1', openingBalance: opening });
  prisma.receipt.aggregate.mockResolvedValue({ _sum: { amount: income } });
  prisma.expenditure.aggregate.mockResolvedValue({ _sum: { amount: committed } });
}

beforeEach(() => {
  vi.resetAllMocks();
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.auditLog.create.mockResolvedValue({});
  prisma.church.findUnique.mockImplementation((async ({ where }: any) => church(where.id)) as never);
});

describe('church finance: route permissions', () => {
  const routes: Array<[string, string, string]> = [
    ['get', '/dashboard', 'finance:view'],
    ['post', '/receipts', 'finance:receipt:create'],
    ['post', '/expenditures', 'finance:expenditure:create'],
    ['get', '/expenditures/pending', 'finance:expenditure:approve'],
    ['post', '/expenditures/e1/approve', 'finance:expenditure:approve'],
    ['post', '/expenditures/e1/pay', 'finance:payment:create'],
  ];
  test.each(routes)('%s %s needs sign-in and %s', async (method, path, permission) => {
    expect((await (request(app) as any)[method](base + path)).status).toBe(401);
    const wrong = await (request(app) as any)[method](base + path).set(as('section_finance:view'));
    expect(wrong.status).toBe(403);
    expect(wrong.body.error).toContain(permission);
  });
});

describe('church finance: dashboard', () => {
  test('voided receipts are excluded and approved spending is committed', async () => {
    balance(1000, 500, 200);
    prisma.receipt.findMany.mockResolvedValue([]);
    prisma.receipt.count.mockResolvedValue(0);
    prisma.expenditure.findMany.mockResolvedValue([]);
    prisma.expenditure.count.mockResolvedValue(0);
    const res = await request(app).get(`${base}/dashboard`).set(as('finance:view'));
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ openingBalance: 1000, totalIncome: 500, totalExpense: 200, currentBalance: 1300 });
    expect(prisma.receipt.aggregate.mock.calls[0][0].where).toEqual({ churchId: 'church-1', status: { not: 'VOIDED' } });
    expect(prisma.expenditure.aggregate.mock.calls[0][0].where).toEqual({ churchId: 'church-1', status: { in: ['APPROVED', 'PAID'] } });
    expect(prisma.receipt.findMany.mock.calls[0][0]).toMatchObject({ where: { churchId: 'church-1' }, take: 10 });
  });

  test('no account yet means an opening balance of zero', async () => {
    prisma.financialAccount.findUnique.mockResolvedValue(null);
    prisma.receipt.aggregate.mockResolvedValue({ _sum: { amount: null } });
    prisma.expenditure.aggregate.mockResolvedValue({ _sum: { amount: null } });
    prisma.receipt.findMany.mockResolvedValue([]);
    prisma.receipt.count.mockResolvedValue(0);
    prisma.expenditure.findMany.mockResolvedValue([]);
    prisma.expenditure.count.mockResolvedValue(0);
    const res = await request(app).get(`${base}/dashboard`).set(as('finance:view'));
    expect(res.body.summary).toEqual({ openingBalance: 0, totalIncome: 0, totalExpense: 0, currentBalance: 0 });
  });

  test("another church's dashboard is refused before any money is read", async () => {
    const res = await request(app).get('/api/v2/churches/church-2/dashboard').set(as('finance:view'));
    expect(res.status).toBe(403);
    expect(prisma.receipt.aggregate).not.toHaveBeenCalled();
  });

  test('unknown church is refused', async () => {
    prisma.church.findUnique.mockResolvedValue(null);
    expect((await request(app).get(`${base}/dashboard`).set(as('finance:view'))).status).toBe(403);
  });
});

describe('church finance: receipts', () => {
  const body = { fundId: 'fund-1', incomeType: 'TITHE', amount: 80, paymentMethod: 'MOBILE_MONEY' };
  const post = (payload: unknown = body, url = `${base}/receipts`) => request(app).post(url).set(as('finance:receipt:create')).send(payload as object);

  beforeEach(() => {
    prisma.fund.findFirst.mockResolvedValue(fund());
    prisma.financialAccount.findUnique.mockResolvedValue({ churchId: 'church-1' });
    prisma.receipt.count.mockResolvedValue(2);
    prisma.receipt.create.mockImplementation((async ({ data }: any) => data) as never);
    prisma.member.findFirst.mockResolvedValue({ id: 'member-9', churchId: 'church-1' });
  });

  test.each([
    ['missing fund', { incomeType: 'TITHE', amount: 5, paymentMethod: 'CASH' }],
    ['zero amount', { ...body, amount: 0 }],
    ['negative amount', { ...body, amount: -1 }],
    ['unknown income type', { ...body, incomeType: 'GIFT' }],
    ['unknown payment method', { ...body, paymentMethod: 'BARTER' }],
  ])('rejects %s', async (_n, payload) => {
    expect((await post(payload)).status).toBe(400);
    expect(prisma.receipt.create).not.toHaveBeenCalled();
  });

  test('issues a numbered receipt recorded by the user and audits it', async () => {
    const res = await post({ ...body, memberId: 'member-9' });
    expect(res.status).toBe(201);
    const data = prisma.receipt.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ churchId: 'church-1', fundId: 'fund-1', memberId: 'member-9', status: 'ISSUED', recordedBy: 'user-1', amount: 80, currency: 'USD' });
    expect(data.receiptNumber).toBe(`CH-${new Date().getFullYear()}-000003`);
    expect(actions()).toEqual(['CHURCH_RECEIPT_CREATED']);
  });

  test('the fund must belong to this church', async () => {
    prisma.fund.findFirst.mockResolvedValue(null);
    const res = await post();
    expect(res.status).toBe(404);
    expect(prisma.fund.findFirst.mock.calls[0][0].where).toEqual({ id: 'fund-1', churchId: 'church-1' });
    expect(prisma.receipt.create).not.toHaveBeenCalled();
  });

  test('an inactive fund takes no money', async () => {
    prisma.fund.findFirst.mockResolvedValue(fund({ isActive: false }));
    const res = await post();
    expect(res.status).toBe(400);
    expect(prisma.receipt.create).not.toHaveBeenCalled();
  });

  test('creates the church account on the first receipt', async () => {
    prisma.financialAccount.findUnique.mockResolvedValue(null);
    prisma.financialAccount.create.mockResolvedValue({});
    await post();
    expect(prisma.financialAccount.create.mock.calls[0][0].data).toMatchObject({ churchId: 'church-1', openingBalance: 0, currentBalance: 0, status: 'ACTIVE' });
  });

  test("a church other than the caller's is refused outright", async () => {
    const res = await post(body, '/api/v2/churches/church-2/receipts');
    expect(res.status).toBe(403);
    expect(prisma.receipt.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  test('the member must belong to this church', async () => {
    prisma.member.findFirst.mockResolvedValue(null);
    const res = await post({ ...body, memberId: 'member-from-elsewhere' });
    expect(res.status).toBe(404);
    expect(prisma.member.findFirst.mock.calls[0][0].where).toEqual({ id: 'member-from-elsewhere', churchId: 'church-1' });
    expect(prisma.receipt.create).not.toHaveBeenCalled();
  });
});

describe('church finance: expenditure requests', () => {
  const body = { fundId: 'fund-1', amount: 40, purpose: 'Roof', category: 'MAINTENANCE' };
  const post = (payload: unknown = body) => request(app).post(`${base}/expenditures`).set(as('finance:expenditure:create')).send(payload as object);

  beforeEach(() => {
    balance(100);
    prisma.fund.findFirst.mockResolvedValue(fund());
    prisma.expenditure.create.mockImplementation((async ({ data }: any) => data) as never);
  });

  test.each([
    ['zero amount', { ...body, amount: 0 }],
    ['empty purpose', { ...body, purpose: '' }],
    ['missing category', { fundId: 'f', amount: 5, purpose: 'x' }],
    ['more than two decimal places', { ...body, amount: 10.005 }],
  ])('rejects %s', async (_n, payload) => {
    expect((await post(payload)).status).toBe(400);
    expect(prisma.expenditure.create).not.toHaveBeenCalled();
  });

  test('submits for approval in this church and audits it', async () => {
    const res = await post();
    expect(res.status).toBe(201);
    expect(prisma.expenditure.create.mock.calls[0][0].data).toMatchObject({ churchId: 'church-1', fundId: 'fund-1', status: 'SUBMITTED', amount: 40, purpose: 'Roof', requestedBy: 'member-1' });
    expect(actions()).toEqual(['CHURCH_EXPENDITURE_REQUESTED']);
  });

  test('spending already approved reduces what can still be requested', async () => {
    balance(100, 0, 70);
    expect((await post({ ...body, amount: 30 })).status).toBe(201);
    prisma.expenditure.create.mockClear();
    await post({ ...body, amount: 30.01 });
    expect(prisma.expenditure.create).not.toHaveBeenCalled();
  });

  test('insufficient balance is refused as a conflict', async () => {
    const res = await post({ ...body, amount: 5000 });
    expect(res.status).toBe(409);
    expect(prisma.expenditure.create).not.toHaveBeenCalled();
  });

  // The expenditure table links the requester to a member record, so it is the signed-in user's member, never the body's.
  test('the requester is the signed-in user, whatever the body says', async () => {
    await post({ ...body, requestedBy: 'somebody-else' });
    expect(prisma.expenditure.create.mock.calls[0][0].data.requestedBy).toBe('member-1');
  });

  test('an account not linked to a member cannot file a request', async () => {
    const noMember = { Authorization: `Bearer ${jwt.sign({ sub: 'user-1', email: 'u@example.com', churchId: 'church-1', memberId: null, permissions: ['finance:expenditure:create'], sessionId: 's1', tokenId: 't1' }, jwtSecret, { expiresIn: '5m' })}` };
    const res = await request(app).post(`${base}/expenditures`).set(noMember).send(body);
    expect(res.status).toBe(400);
    expect(prisma.expenditure.create).not.toHaveBeenCalled();
  });

  test('the fund must belong to this church and be active', async () => {
    prisma.fund.findFirst.mockResolvedValue(null);
    const res = await post();
    expect(prisma.fund.findFirst.mock.calls[0][0].where).toEqual({ id: 'fund-1', churchId: 'church-1' });
    expect(res.status).toBe(404);
    prisma.fund.findFirst.mockResolvedValue(fund({ isActive: false }));
    expect((await post()).status).toBe(400);
    expect(prisma.expenditure.create).not.toHaveBeenCalled();
  });

  test("another church's path is refused", async () => {
    const res = await request(app).post('/api/v2/churches/church-2/expenditures').set(as('finance:expenditure:create')).send(body);
    expect(res.status).toBe(403);
    expect(prisma.expenditure.create).not.toHaveBeenCalled();
  });
});

describe('church finance: pending list', () => {
  const get = (url = `${base}/expenditures/pending`) => request(app).get(url).set(as('finance:expenditure:approve'));
  test('lists submitted items for this church with paging', async () => {
    prisma.expenditure.findMany.mockResolvedValue([exp()]);
    prisma.expenditure.count.mockResolvedValue(1);
    const res = await get(`${base}/expenditures/pending?skip=2&take=3`);
    expect(res.body).toMatchObject({ churchId: 'church-1', total: 1, skip: 2, take: 3 });
    expect(prisma.expenditure.findMany.mock.calls[0][0]).toMatchObject({ where: { churchId: 'church-1', status: 'SUBMITTED' }, skip: 2, take: 3 });
  });
  test.each(['?take=abc', '?take=0', '?take=101', '?skip=-1', '?skip=1.5'])('rejects paging %s', async (q) => {
    expect((await get(`${base}/expenditures/pending${q}`)).status).toBe(400);
    expect(prisma.expenditure.findMany).not.toHaveBeenCalled();
  });
  test("another church's list is refused", async () => {
    expect((await get('/api/v2/churches/church-2/expenditures/pending')).status).toBe(403);
    expect(prisma.expenditure.findMany).not.toHaveBeenCalled();
  });
});

describe('church finance: approval', () => {
  const approve = (payload: unknown = { approved: true }, url = `${base}/expenditures/e1/approve`) =>
    request(app).post(url).set(as('finance:expenditure:approve')).send(payload as object);

  beforeEach(() => {
    prisma.expenditure.findUnique.mockResolvedValue(exp());
    prisma.expenditure.updateMany.mockResolvedValue({ count: 1 });
  });

  test('approves with approver and time, and audits', async () => {
    const res = await approve({ approved: true, approverNotes: 'fine' });
    expect(res.status).toBe(200);
    const call = prisma.expenditure.updateMany.mock.calls[0][0];
    expect(call).toMatchObject({ where: { id: 'e1', status: 'SUBMITTED', churchId: 'church-1' }, data: { status: 'APPROVED', approvedBy: 'user-1' } });
    expect(call.data.approvedAt).toBeInstanceOf(Date);
    expect(actions()).toEqual(['CHURCH_EXPENDITURE_APPROVED']);
    expect(JSON.parse(prisma.auditLog.create.mock.calls[0][0].data.changes)).toMatchObject({ expenditureId: 'e1', approved: true, approverNotes: 'fine' });
  });

  test('rejects', async () => {
    await approve({ approved: false });
    expect(prisma.expenditure.updateMany.mock.calls[0][0].data.status).toBe('REJECTED');
    expect(actions()).toEqual(['CHURCH_EXPENDITURE_REJECTED']);
  });

  test('the approved flag is required; unknown item is 404', async () => {
    expect((await approve({})).status).toBe(400);
    prisma.expenditure.findUnique.mockResolvedValue(null);
    expect((await approve()).status).toBe(404);
    expect(prisma.expenditure.updateMany).not.toHaveBeenCalled();
  });

  test.each(['APPROVED', 'REJECTED', 'PAID'])('an expenditure that is %s cannot be decided again', async (status) => {
    prisma.expenditure.findUnique.mockResolvedValue(exp({ status }));
    const res = await approve();
    expect(res.body.error).toContain(`status is ${status}`);
    expect(prisma.expenditure.updateMany).not.toHaveBeenCalled();
  });

  test('an expenditure of another church is untouchable, even through its own church path', async () => {
    prisma.expenditure.findUnique.mockResolvedValue(exp({ churchId: 'church-2' }));
    const res = await approve({ approved: true }, '/api/v2/churches/church-2/expenditures/e1/approve');
    expect(res.status).toBe(403);
    expect(prisma.expenditure.updateMany).not.toHaveBeenCalled();
  });

  test('an expenditure not belonging to the path church is refused', async () => {
    prisma.expenditure.findUnique.mockResolvedValue(exp({ churchId: 'church-2' }));
    const res = await approve();
    expect(res.status).toBe(400);
    expect(prisma.expenditure.updateMany).not.toHaveBeenCalled();
  });

  test('a repeated decision is a conflict', async () => {
    prisma.expenditure.findUnique.mockResolvedValue(exp({ status: 'PAID' }));
    expect((await approve()).status).toBe(409);
    expect(prisma.expenditure.updateMany).not.toHaveBeenCalled();
  });

  test.each(['user-1', 'member-1'])('the requester (stored as %s) cannot approve their own request', async (who) => {
    prisma.expenditure.findUnique.mockResolvedValue(exp({ requestedBy: who }));
    const res = await approve();
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('your own request');
    expect(prisma.expenditure.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  test('the requester may still reject (withdraw) their own request', async () => {
    prisma.expenditure.findUnique.mockResolvedValue(exp({ requestedBy: 'member-1' }));
    expect((await approve({ approved: false })).status).toBe(200);
  });

  test('losing the race to another approver changes nothing and writes no audit entry', async () => {
    prisma.expenditure.updateMany.mockResolvedValue({ count: 0 });
    const res = await approve();
    expect(res.status).toBe(409);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  test('a non-boolean approved value is rejected', async () => {
    for (const approved of ['false', 'true', 0, 1, null]) expect((await approve({ approved })).status, String(approved)).toBe(400);
    expect(prisma.expenditure.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('church finance: payment', () => {
  const pay = (payload: unknown = { paymentMethod: 'BANK_TRANSFER' }, url = `${base}/expenditures/e1/pay`) =>
    request(app).post(url).set(as('finance:payment:create')).send(payload as object);

  beforeEach(() => {
    prisma.expenditure.findUnique.mockResolvedValue(exp({ status: 'APPROVED' }));
    prisma.expenditure.updateMany.mockResolvedValue({ count: 1 });
  });

  test('pays an approved expenditure and audits the method', async () => {
    const res = await pay();
    expect(res.status).toBe(200);
    expect(prisma.expenditure.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'e1', status: 'APPROVED', churchId: 'church-1' }, data: { status: 'PAID' } });
    expect(JSON.parse(prisma.auditLog.create.mock.calls[0][0].data.changes)).toMatchObject({ paymentMethod: 'BANK_TRANSFER' });
    expect(actions()).toEqual(['CHURCH_EXPENDITURE_PAID']);
  });

  test('the payment method is required; unknown item is 404', async () => {
    expect((await pay({})).status).toBe(400);
    prisma.expenditure.findUnique.mockResolvedValue(null);
    expect((await pay()).status).toBe(404);
  });

  test.each(['SUBMITTED', 'REJECTED', 'PAID'])('an expenditure that is %s cannot be paid', async (status) => {
    prisma.expenditure.findUnique.mockResolvedValue(exp({ status }));
    await pay();
    expect(prisma.expenditure.updateMany).not.toHaveBeenCalled();
  });

  test('an expenditure not belonging to the path church is refused', async () => {
    prisma.expenditure.findUnique.mockResolvedValue(exp({ status: 'APPROVED', churchId: 'church-2' }));
    expect((await pay()).status).toBe(400);
    expect(prisma.expenditure.updateMany).not.toHaveBeenCalled();
  });

  // Regression: payment once never compared the expenditure's church with the caller's, so the other church's id
  // in the path got past the "belongs to path church" check and paid it.
  test("a user cannot pay another church's expenditure, even via that church's own path", async () => {
    prisma.expenditure.findUnique.mockResolvedValue(exp({ status: 'APPROVED', churchId: 'church-2' }));
    const res = await pay({ paymentMethod: 'CASH' }, '/api/v2/churches/church-2/expenditures/e1/pay');
    expect(res.status).toBe(403);
    expect(prisma.expenditure.updateMany).not.toHaveBeenCalled();
    expect(prisma.expenditure.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  test('losing the race to another payment changes nothing and writes no audit entry', async () => {
    prisma.expenditure.updateMany.mockResolvedValue({ count: 0 });
    const res = await pay();
    expect(res.status).toBe(409);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
