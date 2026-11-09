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

// The request schemas insist on UUIDs, so the happy-path ids are UUID-shaped.
const SEC = '11111111-1111-4111-8111-111111111111';
const EXP = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const base = `/api/v2/sections/${SEC}/finance`;

const as = (...permissions: string[]) => ({
  Authorization: `Bearer ${jwt.sign({ sub: USER, email: 'u@example.com', churchId: 'church-1', memberId: 'member-1', permissions, sessionId: 's1', tokenId: 't1' }, jwtSecret, { expiresIn: '5m' })}`,
});

const section = (over: Record<string, unknown> = {}) => ({ id: SEC, churchId: 'church-1', name: 'Women', ...over });
const exp = (over: Record<string, unknown> = {}) => ({ id: EXP, sectionId: SEC, amount: 40, purpose: 'Chairs', status: 'SUBMITTED', requestedBy: 'someone-else', ...over });
const actions = () => prisma.auditLog.create.mock.calls.map((c) => c[0].data.action);

/** Wires the aggregates so the repository reports the given balance. */
function balance(opening: number, income = 0, paid = 0) {
  prisma.sectionFinancialAccount.findUnique.mockResolvedValue({ sectionId: SEC, openingBalance: opening });
  prisma.sectionReceipt.aggregate.mockResolvedValue({ _sum: { amount: income } });
  prisma.sectionExpenditure.aggregate.mockResolvedValue({ _sum: { amount: paid } });
}

beforeEach(() => {
  vi.resetAllMocks();
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.auditLog.create.mockResolvedValue({});
  prisma.notification.create.mockResolvedValue({});
  prisma.leadershipAssignment.findMany.mockResolvedValue([]);
  prisma.sectionJournalEntry.create.mockResolvedValue({});
  prisma.section.findUnique.mockResolvedValue(section());
});

describe('section finance: route permissions', () => {
  const routes: Array<[string, string, string]> = [
    ['get', '/dashboard', 'section_finance:view'],
    ['post', '/receipts', 'section_receipt:create'],
    ['post', '/expenditures', 'section_expenditure:create'],
    ['get', '/expenditures/pending', 'section_expenditure:approve'],
    ['post', `/expenditures/${EXP}/approve`, 'section_expenditure:approve'],
    ['post', `/expenditures/${EXP}/pay`, 'section_payment:create'],
  ];
  test.each(routes)('%s %s needs sign-in and %s', async (method, path, permission) => {
    expect((await (request(app) as any)[method](base + path)).status).toBe(401);
    const wrong = await (request(app) as any)[method](base + path).set(as('finance:view'));
    expect(wrong.status).toBe(403);
    expect(wrong.body.error).toContain(permission);
  });
});

describe('section finance: dashboard', () => {
  test('summary is opening + income - (approved + paid), and every query is scoped to the section', async () => {
    balance(100, 50, 30);
    prisma.sectionReceipt.findMany.mockResolvedValue([{ id: 'r1' }]);
    prisma.sectionReceipt.count.mockResolvedValue(1);
    prisma.sectionExpenditure.findMany.mockResolvedValue([]);
    prisma.sectionExpenditure.count.mockResolvedValue(0);
    const res = await request(app).get(`${base}/dashboard`).set(as('section_finance:view'));
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ openingBalance: 100, totalIncome: 50, totalExpense: 30, currentBalance: 120 });
    expect(prisma.sectionReceipt.aggregate.mock.calls[0][0].where).toEqual({ sectionId: SEC });
    expect(prisma.sectionExpenditure.aggregate.mock.calls[0][0].where).toEqual({ sectionId: SEC, status: { in: ['APPROVED', 'PAID'] } });
    expect(prisma.sectionReceipt.findMany.mock.calls[0][0]).toMatchObject({ where: { sectionId: SEC }, take: 10 });
    expect(prisma.sectionExpenditure.findMany.mock.calls[0][0].where).toEqual({ sectionId: SEC, status: 'SUBMITTED' });
  });

  test('a section from another church is refused and nothing is read', async () => {
    prisma.section.findUnique.mockResolvedValue(section({ churchId: 'church-2' }));
    const res = await request(app).get(`${base}/dashboard`).set(as('section_finance:view'));
    expect(res.status).toBe(403);
    expect(prisma.sectionReceipt.aggregate).not.toHaveBeenCalled();
  });

  test('unknown section is refused', async () => {
    prisma.section.findUnique.mockResolvedValue(null);
    expect((await request(app).get(`${base}/dashboard`).set(as('section_finance:view'))).status).toBe(403);
  });

  test('a section with no finance account yet reports not found', async () => {
    prisma.sectionFinancialAccount.findUnique.mockResolvedValue(null);
    expect((await request(app).get(`${base}/dashboard`).set(as('section_finance:view'))).status).toBe(404);
  });
});

describe('section finance: receipts', () => {
  const body = { incomeType: 'OFFERING', amount: 25.5, paymentMethod: 'CASH' };
  const post = (payload: unknown = body) => request(app).post(`${base}/receipts`).set(as('section_receipt:create')).send(payload as object);

  beforeEach(() => {
    prisma.sectionFinancialAccount.findUnique.mockResolvedValue({ sectionId: SEC, openingBalance: 0 });
    prisma.$transaction.mockImplementation((async (fn: any) => fn(prisma)) as never);
    prisma.receiptSequence.upsert.mockResolvedValue({ last: 5 });
    prisma.sectionReceipt.create.mockImplementation((async ({ data }: any) => data) as never);
  });

  test.each([
    ['zero amount', { ...body, amount: 0 }],
    ['negative amount', { ...body, amount: -5 }],
    ['string amount', { ...body, amount: '25' }],
    ['unknown income type', { ...body, incomeType: 'LOTTERY' }],
    ['unknown payment method', { ...body, paymentMethod: 'BITCOIN' }],
    ['missing payment method', { incomeType: 'OFFERING', amount: 5 }],
    ['empty member id', { ...body, memberId: '' }],
    ['over-long member id', { ...body, memberId: 'x'.repeat(65) }],
  ])('rejects %s', async (_name, payload) => {
    expect((await post(payload)).status).toBe(400);
    expect(prisma.sectionReceipt.create).not.toHaveBeenCalled();
  });

  test('issues a sequential receipt, balanced journal entry, audit entry', async () => {
    const res = await post();
    expect(res.status).toBe(201);
    const created = prisma.sectionReceipt.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ sectionId: SEC, status: 'ISSUED', issuedBy: USER, amount: 25.5, memberId: null });
    expect(created.receiptNumber).toBe(`SEC-${new Date().getFullYear()}-000005`);
    expect(prisma.receiptSequence.upsert.mock.calls[0][0].where.churchId_year.churchId).toBe('GLOBAL:SEC');
    const journal = prisma.sectionJournalEntry.create.mock.calls[0][0].data;
    expect(journal.debitAmount).toBe(journal.creditAmount);
    expect(journal).toMatchObject({ sectionId: SEC, receiptId: created.id, debitAmount: 25.5 });
    expect(actions()).toEqual(['SECTION_RECEIPT_CREATED']);
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ churchId: 'church-1', entityId: SEC, actorId: USER });
  });

  test('the section comes from the path, not the body', async () => {
    const other = '44444444-4444-4444-8444-444444444444';
    await post({ ...body, sectionId: other });
    expect(prisma.section.findUnique.mock.calls[0][0].where).toEqual({ id: SEC });
    expect(prisma.sectionReceipt.create.mock.calls[0][0].data.sectionId).toBe(SEC);
  });

  test('creates the section account on first receipt, in the caller church', async () => {
    prisma.sectionFinancialAccount.findUnique.mockResolvedValue(null);
    prisma.sectionFinancialAccount.create.mockResolvedValue({ sectionId: SEC });
    expect((await post()).status).toBe(201);
    expect(prisma.sectionFinancialAccount.create.mock.calls[0][0].data).toMatchObject({ sectionId: SEC, churchId: 'church-1', openingBalance: 0, currentBalance: 0 });
  });

  test('a section of another church gets nothing issued', async () => {
    prisma.section.findUnique.mockResolvedValue(section({ churchId: 'church-2' }));
    expect((await post()).status).toBe(403);
    expect(prisma.sectionReceipt.create).not.toHaveBeenCalled();
    expect(prisma.sectionJournalEntry.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  test('section leaders and secretaries are notified', async () => {
    prisma.leadershipAssignment.findMany.mockResolvedValue([{ memberId: 'lead-m' }, { memberId: 'sec-m' }]);
    prisma.user.findFirst.mockImplementation((async ({ where }: any) => (where.memberId === 'lead-m' ? { id: 'lead-u' } : null)) as never);
    await post();
    expect(prisma.leadershipAssignment.findMany.mock.calls[0][0].where).toMatchObject({ sectionId: SEC, endDate: null });
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(prisma.notification.create.mock.calls[0][0].data).toMatchObject({ recipientId: 'lead-u', entityId: SEC });
  });

  test('accepts a real (cuid) section id', async () => {
    const cuid = 'cm0abc123def456ghi789jkl0';
    prisma.section.findUnique.mockResolvedValue(section({ id: cuid }));
    const res = await request(app).post(`/api/v2/sections/${cuid}/finance/receipts`).set(as('section_receipt:create')).send(body);
    expect(res.status).toBe(201);
  });

  test('rejects more than two decimal places but accepts cents', async () => {
    expect((await post({ ...body, amount: 10.001 })).status).toBe(400);
    expect(prisma.sectionReceipt.create).not.toHaveBeenCalled();
    expect((await post({ ...body, amount: 10.1 })).status).toBe(201);
  });
});

describe('section finance: expenditure requests', () => {
  const body = { amount: 40, purpose: 'Chairs', expenseCategory: 'EQUIPMENT', requestedBy: USER };
  const post = (payload: unknown = body) => request(app).post(`${base}/expenditures`).set(as('section_expenditure:create')).send(payload as object);

  beforeEach(() => {
    balance(100);
    prisma.sectionExpenditure.create.mockImplementation((async ({ data }: any) => data) as never);
  });

  test.each([
    ['zero amount', { ...body, amount: 0 }],
    ['empty purpose', { ...body, purpose: '' }],
    ['missing category', { amount: 5, purpose: 'x', requestedBy: USER }],
    ['more than two decimal places', { ...body, amount: 5.123 }],
  ])('rejects %s', async (_n, payload) => {
    expect((await post(payload)).status).toBe(400);
    expect(prisma.sectionExpenditure.create).not.toHaveBeenCalled();
  });

  test('submits for approval as the signed-in user, scoped to the path section', async () => {
    const res = await post({ ...body, requestedBy: '55555555-5555-4555-8555-555555555555', description: 'for hall' });
    expect(res.status).toBe(201);
    expect(prisma.sectionExpenditure.create.mock.calls[0][0].data).toMatchObject({ sectionId: SEC, status: 'SUBMITTED', requestedBy: USER, amount: 40, description: 'for hall', attachments: [] });
    expect(actions()).toEqual(['SECTION_EXPENDITURE_REQUESTED']);
  });

  test('a request for exactly the balance is allowed; one cent more is not', async () => {
    expect((await post({ ...body, amount: 100 })).status).toBe(201);
    prisma.sectionExpenditure.create.mockClear();
    const over = await post({ ...body, amount: 100.01 });
    expect(prisma.sectionExpenditure.create).not.toHaveBeenCalled();
    expect(over.body.error).toContain('Insufficient section balance');
  });

  test('insufficient balance is refused as a conflict', async () => {
    const res = await post({ ...body, amount: 500 });
    expect(res.status).toBe(409);
    expect(prisma.sectionExpenditure.create).not.toHaveBeenCalled();
  });

  test('a section of another church is refused', async () => {
    prisma.section.findUnique.mockResolvedValue(section({ churchId: 'church-2' }));
    expect((await post()).status).toBe(403);
    expect(prisma.sectionExpenditure.create).not.toHaveBeenCalled();
  });

  test('leadership is notified that approval is pending', async () => {
    prisma.leadershipAssignment.findMany.mockResolvedValue([{ memberId: 'lead-m' }]);
    prisma.user.findFirst.mockResolvedValue({ id: 'lead-u' });
    await post();
    expect(prisma.notification.create.mock.calls[0][0].data).toMatchObject({ recipientId: 'lead-u', type: 'SECTION_EXPENDITURE_PENDING' });
  });

  test('counts approved-but-unpaid spending against the balance', async () => {
    await post();
    expect(prisma.sectionExpenditure.aggregate.mock.calls[0][0].where.status).toEqual({ in: ['APPROVED', 'PAID'] });
  });
});

describe('section finance: pending list', () => {
  const get = (q = '') => request(app).get(`${base}/expenditures/pending${q}`).set(as('section_expenditure:approve'));
  beforeEach(() => {
    prisma.sectionExpenditure.findMany.mockResolvedValue([exp()]);
    prisma.sectionExpenditure.count.mockResolvedValue(1);
  });

  test('lists only submitted items of this section, with paging', async () => {
    const res = await get('?skip=5&take=7');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sectionId: SEC, total: 1, skip: 5, take: 7 });
    expect(prisma.sectionExpenditure.findMany.mock.calls[0][0]).toMatchObject({ where: { sectionId: SEC, status: 'SUBMITTED' }, skip: 5, take: 7 });
  });

  test('defaults to the first 20', async () => {
    await get();
    expect(prisma.sectionExpenditure.findMany.mock.calls[0][0]).toMatchObject({ skip: 0, take: 20 });
  });

  test('another church section is refused', async () => {
    prisma.section.findUnique.mockResolvedValue(section({ churchId: 'church-2' }));
    expect((await get()).status).toBe(403);
    expect(prisma.sectionExpenditure.findMany).not.toHaveBeenCalled();
  });

  test.each(['?take=abc', '?take=0', '?take=101', '?take=100000', '?skip=-1', '?skip=1.5'])('rejects paging %s', async (q) => {
    expect((await get(q)).status).toBe(400);
    expect(prisma.sectionExpenditure.findMany).not.toHaveBeenCalled();
  });
});

describe('section finance: approval', () => {
  const approve = (payload: unknown = { approved: true }, id = EXP) =>
    request(app).post(`${base}/expenditures/${id}/approve`).set(as('section_expenditure:approve')).send(payload as object);

  beforeEach(() => {
    prisma.sectionExpenditure.findUnique.mockResolvedValue(exp());
    prisma.sectionExpenditure.updateMany.mockResolvedValue({ count: 1 });
  });

  test('the approved flag is required', async () => {
    const res = await approve({});
    expect(res.status).toBe(400);
    expect(prisma.sectionExpenditure.updateMany).not.toHaveBeenCalled();
  });

  test('approves: status, approver, notes, audit and requester notified', async () => {
    const res = await approve({ approved: true, approverNotes: 'ok' });
    expect(res.status).toBe(200);
    expect(prisma.sectionExpenditure.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: EXP, status: 'SUBMITTED', sectionId: SEC }, data: { status: 'APPROVED', approvedBy: USER, approverNotes: 'ok' } });
    expect(actions()).toEqual(['SECTION_EXPENDITURE_APPROVED']);
    expect(prisma.notification.create.mock.calls[0][0].data).toMatchObject({ recipientId: 'someone-else', type: 'SECTION_EXPENDITURE_APPROVED' });
  });

  test('rejects: status REJECTED, audited', async () => {
    await approve({ approved: false });
    expect(prisma.sectionExpenditure.updateMany.mock.calls[0][0].data.status).toBe('REJECTED');
    expect(actions()).toEqual(['SECTION_EXPENDITURE_REJECTED']);
    expect(prisma.notification.create.mock.calls[0][0].data.type).toBe('SECTION_EXPENDITURE_REJECTED');
  });

  test('unknown expenditure is 404', async () => {
    prisma.sectionExpenditure.findUnique.mockResolvedValue(null);
    expect((await approve()).status).toBe(404);
  });

  test.each(['APPROVED', 'REJECTED', 'PAID', 'DRAFT'])('an expenditure that is %s cannot be decided again', async (status) => {
    prisma.sectionExpenditure.findUnique.mockResolvedValue(exp({ status }));
    const res = await approve();
    expect(res.body.error).toContain(`status is ${status}`);
    expect(prisma.sectionExpenditure.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  test('an expenditure of a different section is not touched', async () => {
    prisma.sectionExpenditure.findUnique.mockResolvedValue(exp({ sectionId: '99999999-9999-4999-8999-999999999999' }));
    const res = await approve();
    expect(res.status).toBe(400);
    expect(prisma.sectionExpenditure.updateMany).not.toHaveBeenCalled();
  });

  test('an expenditure whose section belongs to another church is not touched', async () => {
    prisma.section.findUnique.mockResolvedValue(section({ churchId: 'church-2' }));
    expect((await approve()).status).toBe(403);
    expect(prisma.sectionExpenditure.updateMany).not.toHaveBeenCalled();
  });

  test('a repeated decision is a conflict', async () => {
    prisma.sectionExpenditure.findUnique.mockResolvedValue(exp({ status: 'APPROVED' }));
    expect((await approve()).status).toBe(409);
    expect(prisma.sectionExpenditure.updateMany).not.toHaveBeenCalled();
  });

  test('the requester cannot approve their own request, but may reject it', async () => {
    prisma.sectionExpenditure.findUnique.mockResolvedValue(exp({ requestedBy: USER }));
    const res = await approve();
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('your own request');
    expect(prisma.sectionExpenditure.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect((await approve({ approved: false })).status).toBe(200);
  });

  test('losing the race to another approver changes nothing: no audit entry, no notification', async () => {
    prisma.sectionExpenditure.updateMany.mockResolvedValue({ count: 0 });
    const res = await approve();
    expect(res.status).toBe(409);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  test('a non-boolean approved value is rejected', async () => {
    for (const approved of ['false', 'true', 0, 1, null]) expect((await approve({ approved })).status, String(approved)).toBe(400);
    expect(prisma.sectionExpenditure.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('section finance: payment', () => {
  const pay = (payload: unknown = { paymentMethod: 'CASH' }) =>
    request(app).post(`${base}/expenditures/${EXP}/pay`).set(as('section_payment:create')).send(payload as object);

  beforeEach(() => {
    prisma.sectionExpenditure.findUnique.mockResolvedValue(exp({ status: 'APPROVED', amount: '40.00' }));
    prisma.sectionExpenditure.updateMany.mockResolvedValue({ count: 1 });
  });

  test('the payment method is required', async () => {
    expect((await pay({})).status).toBe(400);
    expect(prisma.sectionExpenditure.updateMany).not.toHaveBeenCalled();
  });

  test('pays an approved item: status, balanced journal entry, audit', async () => {
    const res = await pay();
    expect(res.status).toBe(200);
    expect(prisma.sectionExpenditure.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: EXP, status: 'APPROVED', sectionId: SEC }, data: { status: 'PAID', paymentMethod: 'CASH' } });
    const journal = prisma.sectionJournalEntry.create.mock.calls[0][0].data;
    expect(journal).toMatchObject({ sectionId: SEC, expenditureId: EXP, debitAmount: 40, creditAmount: 40 });
    expect(actions()).toEqual(['SECTION_EXPENDITURE_PAID']);
  });

  test.each(['SUBMITTED', 'REJECTED', 'PAID', 'DRAFT'])('an expenditure that is %s cannot be paid', async (status) => {
    prisma.sectionExpenditure.findUnique.mockResolvedValue(exp({ status }));
    await pay();
    expect(prisma.sectionExpenditure.updateMany).not.toHaveBeenCalled();
    expect(prisma.sectionJournalEntry.create).not.toHaveBeenCalled();
  });

  test('unknown expenditure is 404; other section and other church are refused', async () => {
    prisma.sectionExpenditure.findUnique.mockResolvedValue(null);
    expect((await pay()).status).toBe(404);
    prisma.sectionExpenditure.findUnique.mockResolvedValue(exp({ status: 'APPROVED', sectionId: 'other' }));
    expect((await pay()).status).toBeGreaterThanOrEqual(400);
    prisma.sectionExpenditure.findUnique.mockResolvedValue(exp({ status: 'APPROVED' }));
    prisma.section.findUnique.mockResolvedValue(section({ churchId: 'church-2' }));
    expect((await pay()).status).toBe(403);
    expect(prisma.sectionExpenditure.updateMany).not.toHaveBeenCalled();
  });

  test('losing the race to another payment writes no journal entry and no audit entry', async () => {
    prisma.sectionExpenditure.updateMany.mockResolvedValue({ count: 0 });
    const res = await pay();
    expect(res.status).toBe(409);
    expect(prisma.sectionJournalEntry.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
