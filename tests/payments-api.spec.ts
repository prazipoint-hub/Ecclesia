import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { createMockPrisma } from './helpers/mockPrisma';

const mocked = vi.hoisted(() => ({ prisma: undefined as unknown, fetch: undefined as unknown }));

vi.mock('@/database', async () => {
  const { createMockPrisma: create } = await import('./helpers/mockPrisma');
  mocked.prisma = create();
  return { prisma: mocked.prisma, default: mocked.prisma };
});

vi.mock('@/services/payments', async () => {
  const { PaynowGateway } = await import('@/services/payments/gateways/paynow');
  mocked.fetch = vi.fn();
  return {
    paymentGateway: new PaynowGateway({
      integrationId: '1234',
      integrationKey: 'secret-key',
      resultUrl: 'https://api.test/hook',
      returnUrl: 'https://app.test/give/confirm',
      fetchImpl: mocked.fetch as typeof fetch,
    }),
  };
});

import { createApp } from '@/app';
import { jwtSecret } from '@/config/secrets';
import { paynowHash } from '@/services/payments/gateways/paynow';

const prisma = mocked.prisma as ReturnType<typeof createMockPrisma>;
const fetchMock = mocked.fetch as ReturnType<typeof vi.fn>;
const app = createApp();

const token = (opts: { memberId?: string | null; permissions?: string[] } = {}) =>
  jwt.sign(
    { sub: 'user-1', email: 'a@example.com', churchId: 'church-1', memberId: opts.memberId === undefined ? 'member-1' : opts.memberId, permissions: opts.permissions ?? [], sessionId: 's1', tokenId: 't1' },
    jwtSecret,
    { expiresIn: '5m' }
  );
const auth = (opts?: Parameters<typeof token>[0]) => ({ Authorization: `Bearer ${token(opts)}` });

const signed = (fields: Record<string, string>) => ({ ...fields, hash: paynowHash(Object.values(fields), 'secret-key') });
const gatewayReply = (fields: Record<string, string>) => new Response(new URLSearchParams(signed(fields)).toString());
const POLL = 'https://www.paynow.co.zw/interface/poll/?guid=1';

const payment = (over: Record<string, unknown> = {}) => ({
  id: 'pay-1', churchId: 'church-1', memberId: 'member-1', fundId: 'fund-1', pledgeId: null, recurringGivingId: null, receiptId: null,
  amount: new Prisma.Decimal('25'), currency: 'USD', incomeType: 'TITHE', gateway: 'PAYNOW', method: 'ECOCASH', phone: '0771234567',
  reference: 'ECC-ABC', gatewayRef: null, pollUrl: POLL, redirectUrl: null, instructions: 'Approve the prompt', status: 'PENDING',
  failureReason: null, paidAt: null, createdAt: new Date(), updatedAt: new Date(),
  fund: { name: 'General Fund', accountId: 'acc-1' }, receipt: null, ...over,
});

const paidHook = (over: Record<string, string> = {}) =>
  signed({ reference: 'ECC-ABC', paynowreference: '777', amount: '25.00', status: 'Paid', pollurl: POLL, ...over });

beforeEach(() => {
  vi.resetAllMocks();
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.$transaction.mockImplementation((async (arg: unknown) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg as unknown[]))) as never);
});

describe('initiating a payment', () => {
  const body = { fundId: 'fund-1', amount: 25, incomeType: 'TITHE', method: 'ECOCASH', phone: '0771234567' };

  beforeEach(() => {
    prisma.fund.findFirst.mockResolvedValue({ id: 'fund-1', name: 'General Fund' });
    prisma.member.findUnique.mockResolvedValue({ id: 'member-1', email: 'ada@example.com', firstName: 'Ada' });
    prisma.payment.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => payment({ ...data, id: 'pay-1', pollUrl: null, instructions: null }));
    prisma.payment.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => payment(data));
    fetchMock.mockResolvedValue(gatewayReply({ status: 'Ok', instructions: 'Approve the prompt', paynowreference: '777', pollurl: POLL }));
  });

  test('requires sign-in and a linked member', async () => {
    expect((await request(app).post('/api/v2/payments/initiate').send(body)).status).toBe(401);
    expect((await request(app).post('/api/v2/payments/initiate').set(auth({ memberId: null })).send(body)).status).toBe(403);
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  test.each([
    ['bad phone', { phone: '12345' }],
    ['missing phone for mobile money', { phone: undefined }],
    ['three decimal places', { amount: 10.123 }],
    ['zero amount', { amount: 0 }],
    ['negative amount', { amount: -5 }],
    ['absurd amount', { amount: 5_000_000 }],
    ['unknown method', { method: 'BITCOIN' }],
    ['unexpected field', { status: 'COMPLETED' }],
  ])('rejects %s', async (_name, patch) => {
    const res = await request(app).post('/api/v2/payments/initiate').set(auth()).send({ ...body, ...patch });
    expect(res.status).toBe(400);
    expect(prisma.payment.create).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('records a pending payment, calls the gateway with a signed request and hides gateway internals', async () => {
    const res = await request(app).post('/api/v2/payments/initiate').set(auth()).send(body);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'PENDING', amount: 25, method: 'ECOCASH', fundName: 'General Fund', instructions: 'Approve the prompt' });
    expect(res.body).not.toHaveProperty('pollUrl');
    expect(res.body).not.toHaveProperty('gatewayRef');

    const created = prisma.payment.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ churchId: 'church-1', memberId: 'member-1', status: 'PENDING', gateway: 'PAYNOW' });
    expect(created.reference).toMatch(/^ECC-[0-9A-F]{16}$/);
    expect(prisma.fund.findFirst.mock.calls[0][0].where).toEqual({ id: 'fund-1', churchId: 'church-1' });

    const sent = new URLSearchParams((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(sent.get('amount')).toBe('25.00');
    expect(sent.get('reference')).toBe(created.reference);
    expect(sent.get('authemail')).toBe('ada@example.com');
  });

  test('a fund from another church is not found and nothing is sent', async () => {
    prisma.fund.findFirst.mockResolvedValue(null);
    const res = await request(app).post('/api/v2/payments/initiate').set(auth()).send(body);
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('gateway failure marks the payment failed and reports 502', async () => {
    fetchMock.mockResolvedValue(new Response('status=Error&error=Invalid+Integration+Key'));
    const res = await request(app).post('/api/v2/payments/initiate').set(auth()).send(body);
    expect(res.status).toBe(502);
    expect(prisma.payment.update.mock.calls.at(-1)?.[0].data).toMatchObject({ status: 'FAILED' });
  });

  test("cannot pay towards someone else's pledge", async () => {
    prisma.pledge.findUnique.mockResolvedValue({ id: 'pl-1', memberId: 'member-2', status: 'ACTIVE', payments: [] });
    const res = await request(app).post('/api/v2/payments/initiate').set(auth()).send({ ...body, pledgeId: 'pl-1' });
    expect(res.status).toBe(404);
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  test("cannot use someone else's saved payment method", async () => {
    prisma.savedPaymentMethod.findUnique.mockResolvedValue({ id: 'sm-1', memberId: 'member-2', type: 'ECOCASH', phone: '0771111111' });
    const res = await request(app).post('/api/v2/payments/initiate').set(auth()).send({ fundId: 'fund-1', amount: 5, method: 'ECOCASH', savedMethodId: 'sm-1' });
    expect(res.status).toBe(404);
  });
});

describe('gateway webhook', () => {
  const settle = () => {
    prisma.payment.findUnique.mockResolvedValue(payment());
    prisma.payment.updateMany.mockResolvedValue({ count: 1 });
    prisma.receipt.create.mockResolvedValue({ id: 'rc-1' });
    prisma.payment.update.mockResolvedValue({});
    prisma.notification.createMany.mockResolvedValue({ count: 1 });
    prisma.member.findFirst.mockResolvedValue({ id: 'member-1', firstName: 'Ada', lastName: 'Moyo', email: null, phone: null });
    prisma.church.findUnique.mockResolvedValue({ name: 'Grace UMC' });
    prisma.notificationPreference.findMany.mockResolvedValue([]);
  };
  const post = (b: Record<string, string>) => request(app).post('/api/v2/payments/webhook/paynow').type('form').send(b);

  test('rejects a forged callback without touching the database', async () => {
    const res = await post({ ...paidHook(), amount: '0.01' });
    expect(res.status).toBe(401);
    expect(prisma.payment.findUnique).not.toHaveBeenCalled();
    expect(prisma.receipt.create).not.toHaveBeenCalled();
  });

  test('a genuine paid callback completes the payment, issues a receipt and notifies the member', async () => {
    settle();
    const res = await post(paidHook());
    expect(res.status).toBe(200);
    expect(prisma.payment.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'pay-1', status: 'PENDING' }, data: { status: 'COMPLETED' } });
    expect(prisma.receipt.create.mock.calls[0][0].data).toMatchObject({
      churchId: 'church-1', fundId: 'fund-1', memberId: 'member-1', financialAccountId: 'acc-1', currency: 'USD', incomeType: 'TITHE',
      paymentMethod: 'MOBILE_MONEY', receiptNumber: 'ON-ECC-ABC', status: 'ISSUED',
    });
    expect(prisma.payment.update.mock.calls[0][0]).toMatchObject({ where: { id: 'pay-1' }, data: { receiptId: 'rc-1' } });
    expect(prisma.notification.createMany.mock.calls[0][0].data[0]).toMatchObject({ recipientId: 'member-1', type: 'PAYMENT_RECEIVED', category: 'GIVING' });
  });

  test('replaying the callback does not issue a second receipt', async () => {
    settle();
    prisma.payment.findUnique.mockResolvedValue(payment({ status: 'COMPLETED' }));
    expect((await post(paidHook())).status).toBe(200);
    expect(prisma.receipt.create).not.toHaveBeenCalled();
  });

  test('losing the race to another settlement issues no receipt', async () => {
    settle();
    prisma.payment.updateMany.mockResolvedValue({ count: 0 });
    await post(paidHook());
    expect(prisma.receipt.create).not.toHaveBeenCalled();
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  test('an amount that differs from what was requested is failed, not receipted', async () => {
    settle();
    await post(paidHook({ amount: '1.00' }));
    expect(prisma.receipt.create).not.toHaveBeenCalled();
    expect(prisma.payment.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'FAILED' });
  });

  test('cancelled callback records the cancellation only', async () => {
    settle();
    await post(paidHook({ status: 'Cancelled' }));
    expect(prisma.payment.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'CANCELLED' });
    expect(prisma.receipt.create).not.toHaveBeenCalled();
  });

  test('an unknown reference is acknowledged and ignored', async () => {
    prisma.payment.findUnique.mockResolvedValue(null);
    expect((await post(paidHook({ reference: 'ECC-NOPE' }))).status).toBe(200);
    expect(prisma.receipt.create).not.toHaveBeenCalled();
  });

  test('completing the final instalment fulfils the pledge', async () => {
    settle();
    prisma.payment.findUnique.mockResolvedValue(payment({ pledgeId: 'pl-1' }));
    prisma.pledge.findUnique.mockResolvedValue({ id: 'pl-1', status: 'ACTIVE', targetAmount: new Prisma.Decimal('100') });
    prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal('100') } });
    await post(paidHook());
    expect(prisma.pledge.update).toHaveBeenCalledWith({ where: { id: 'pl-1' }, data: { status: 'FULFILLED' } });
  });

  test('a partial instalment leaves the pledge active', async () => {
    settle();
    prisma.payment.findUnique.mockResolvedValue(payment({ pledgeId: 'pl-1' }));
    prisma.pledge.findUnique.mockResolvedValue({ id: 'pl-1', status: 'ACTIVE', targetAmount: new Prisma.Decimal('100') });
    prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal('25') } });
    await post(paidHook());
    expect(prisma.pledge.update).not.toHaveBeenCalled();
  });
});

describe('reading payments', () => {
  test("another member's payment is 404", async () => {
    prisma.payment.findUnique.mockResolvedValue(payment({ memberId: 'member-2' }));
    expect((await request(app).get('/api/v2/payments/pay-1').set(auth())).status).toBe(404);
  });

  test("a payment from another church is 404 even with view:all", async () => {
    prisma.payment.findUnique.mockResolvedValue(payment({ churchId: 'church-2', memberId: 'member-2' }));
    expect((await request(app).get('/api/v2/payments/pay-1').set(auth({ permissions: ['payment:view:all'] }))).status).toBe(404);
  });

  test('staff with payment:view:all can read any payment in their church', async () => {
    prisma.payment.findUnique.mockResolvedValue(payment({ memberId: 'member-2', status: 'FAILED' }));
    expect((await request(app).get('/api/v2/payments/pay-1').set(auth({ permissions: ['payment:view:all'] }))).status).toBe(200);
  });

  test('polling a pending payment asks the gateway and settles it if paid', async () => {
    const pending = payment();
    prisma.payment.findUnique.mockResolvedValueOnce(pending).mockResolvedValue(payment({ status: 'COMPLETED', receipt: { receiptNumber: 'ON-ECC-ABC' }, paidAt: new Date() }));
    fetchMock.mockResolvedValue(gatewayReply({ reference: 'ECC-ABC', paynowreference: '777', amount: '25.00', status: 'Paid', pollurl: POLL }));
    prisma.payment.updateMany.mockResolvedValue({ count: 1 });
    prisma.receipt.create.mockResolvedValue({ id: 'rc-1' });
    prisma.payment.update.mockResolvedValue({});
    prisma.notification.createMany.mockResolvedValue({ count: 1 });
    prisma.member.findFirst.mockResolvedValue({ id: 'member-1', firstName: 'Ada', lastName: 'Moyo', email: null, phone: null });
    prisma.church.findUnique.mockResolvedValue({ name: 'Grace UMC' });
    prisma.notificationPreference.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/v2/payments/pay-1').set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'COMPLETED', receiptNumber: 'ON-ECC-ABC', instructions: null });
    expect(prisma.receipt.create).toHaveBeenCalledTimes(1);
  });

  test('a gateway hiccup while polling still returns the pending payment', async () => {
    prisma.payment.findUnique.mockResolvedValue(payment());
    fetchMock.mockRejectedValue(new Error('timeout'));
    const res = await request(app).get('/api/v2/payments/pay-1').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PENDING');
  });

  test('payment history is scoped to the caller; the staff list needs permission', async () => {
    prisma.payment.findMany.mockResolvedValue([payment()]);
    prisma.payment.count.mockResolvedValue(1);
    const mine = await request(app).get('/api/v2/payments/mine?memberId=member-2').set(auth());
    expect(mine.status).toBe(200);
    expect(prisma.payment.findMany.mock.calls[0][0].where).toEqual({ memberId: 'member-1' });
    expect((await request(app).get('/api/v2/payments/all').set(auth())).status).toBe(403);
    expect((await request(app).get('/api/v2/payments/all?status=PENDING').set(auth({ permissions: ['payment:view:all'] }))).status).toBe(200);
    expect(prisma.payment.findMany.mock.calls[1][0].where).toEqual({ churchId: 'church-1', status: 'PENDING' });
  });

  test('fund picker exposes names only', async () => {
    prisma.fund.findMany.mockResolvedValue([{ id: 'fund-1', name: 'General Fund', description: null }]);
    const res = await request(app).get('/api/v2/payments/funds').set(auth());
    expect(res.body).toEqual([{ id: 'fund-1', name: 'General Fund', description: null }]);
    expect(prisma.fund.findMany.mock.calls[0][0]).toMatchObject({ where: { churchId: 'church-1' }, select: { id: true, name: true, description: true } });
  });
});

describe('pledges', () => {
  const pledgeRow = (over: Record<string, unknown> = {}) => ({
    id: 'pl-1', churchId: 'church-1', memberId: 'member-1', fundId: 'fund-1', name: 'Building', targetAmount: new Prisma.Decimal('100'),
    currency: 'USD', status: 'ACTIVE', startDate: new Date('2026-01-01'), endDate: null, fund: { name: 'General Fund' },
    payments: [
      { id: 'p1', amount: new Prisma.Decimal('0.10'), currency: 'USD', paidAt: new Date() },
      { id: 'p2', amount: new Prisma.Decimal('0.20'), currency: 'USD', paidAt: new Date() },
    ],
    ...over,
  });

  test('progress is the exact sum of completed payments', async () => {
    prisma.pledge.findMany.mockResolvedValue([pledgeRow()]);
    prisma.pledge.count.mockResolvedValue(1);
    const res = await request(app).get('/api/v2/pledges').set(auth());
    expect(res.body.items[0]).toMatchObject({ targetAmount: 100, paidAmount: 0.3, remainingAmount: 99.7, status: 'ACTIVE' });
    expect(prisma.pledge.findMany.mock.calls[0][0].where).toEqual({ memberId: 'member-1' });
    expect(prisma.pledge.findMany.mock.calls[0][0].include.payments.where).toEqual({ status: 'COMPLETED' });
  });

  test('create validates and checks the fund belongs to the church', async () => {
    expect((await request(app).post('/api/v2/pledges').set(auth()).send({ fundId: 'f', name: '', targetAmount: 10 })).status).toBe(400);
    prisma.fund.findFirst.mockResolvedValue(null);
    expect((await request(app).post('/api/v2/pledges').set(auth()).send({ fundId: 'f', name: 'x', targetAmount: 10 })).status).toBe(404);
    prisma.fund.findFirst.mockResolvedValue({ id: 'fund-1', name: 'General Fund' });
    prisma.pledge.create.mockResolvedValue({ id: 'pl-1' });
    prisma.pledge.findUnique.mockResolvedValue(pledgeRow());
    const ok = await request(app).post('/api/v2/pledges').set(auth()).send({ fundId: 'fund-1', name: 'Building', targetAmount: 100 });
    expect(ok.status).toBe(201);
    expect(prisma.pledge.create.mock.calls[0][0].data).toMatchObject({ churchId: 'church-1', memberId: 'member-1' });
  });

  test("someone else's pledge is hidden; staff list needs pledge:view:all", async () => {
    prisma.pledge.findUnique.mockResolvedValue(pledgeRow({ memberId: 'member-2' }));
    expect((await request(app).get('/api/v2/pledges/pl-1').set(auth())).status).toBe(404);
    expect((await request(app).put('/api/v2/pledges/pl-1/cancel').set(auth())).status).toBe(404);
    expect((await request(app).get('/api/v2/pledges/all').set(auth())).status).toBe(403);
  });

  test('cancelling twice conflicts', async () => {
    prisma.pledge.findUnique.mockResolvedValue(pledgeRow({ status: 'CANCELLED' }));
    expect((await request(app).put('/api/v2/pledges/pl-1/cancel').set(auth())).status).toBe(409);
  });
});

describe('recurring giving', () => {
  const schedule = (over: Record<string, unknown> = {}) => ({
    id: 'rg-1', churchId: 'church-1', memberId: 'member-1', fundId: 'fund-1', amount: new Prisma.Decimal('10'), currency: 'USD',
    incomeType: 'OFFERING', frequency: 'MONTHLY', method: 'ECOCASH', phone: '0771234567', nextChargeDate: new Date('2026-01-31T00:00:00Z'),
    isActive: true, fund: { name: 'General Fund' }, ...over,
  });

  test('masks the phone number in responses', async () => {
    prisma.recurringGiving.findMany.mockResolvedValue([schedule()]);
    const res = await request(app).get('/api/v2/recurring-giving').set(auth());
    expect(res.body[0].phone).toBe('077****567');
  });

  test("cannot pause someone else's schedule", async () => {
    prisma.recurringGiving.findUnique.mockResolvedValue(schedule({ memberId: 'member-2' }));
    expect((await request(app).put('/api/v2/recurring-giving/rg-1/pause').set(auth())).status).toBe(404);
  });

  test('run-due needs recurring:manage', async () => {
    expect((await request(app).post('/api/v2/recurring-giving/run-due').set(auth())).status).toBe(403);
  });

  test('run-due starts a payment per due schedule, advances the date, and survives a failure', async () => {
    prisma.recurringGiving.findMany.mockResolvedValue([schedule(), schedule({ id: 'rg-2' })]);
    prisma.fund.findFirst.mockResolvedValue({ id: 'fund-1', name: 'General Fund' });
    prisma.member.findUnique.mockResolvedValue({ id: 'member-1', email: null, firstName: 'Ada' });
    prisma.payment.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => payment({ ...data }));
    prisma.payment.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => payment(data));
    prisma.recurringGiving.update.mockResolvedValue(schedule());
    fetchMock
      .mockResolvedValueOnce(gatewayReply({ status: 'Ok', pollurl: POLL }))
      .mockResolvedValueOnce(new Response('status=Error&error=Nope'));

    const res = await request(app).post('/api/v2/recurring-giving/run-due').set(auth({ permissions: ['recurring:manage'] }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ due: 2, started: 1, failed: 1 });
    expect(prisma.payment.create.mock.calls[0][0].data).toMatchObject({ recurringGivingId: 'rg-1', method: 'ECOCASH' });
    expect(prisma.recurringGiving.update).toHaveBeenCalledTimes(2);
    const next = prisma.recurringGiving.update.mock.calls[0][0].data.nextChargeDate as Date;
    expect(next.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('saved payment methods', () => {
  test('lists with masked numbers and never returns the full phone', async () => {
    prisma.savedPaymentMethod.findMany.mockResolvedValue([{ id: 'sm-1', memberId: 'member-1', type: 'ECOCASH', phone: '0771234567', label: 'My EcoCash', isDefault: true }]);
    const res = await request(app).get('/api/v2/payment-methods').set(auth());
    expect(res.body[0]).toEqual({ id: 'sm-1', type: 'ECOCASH', label: 'My EcoCash', isDefault: true, phoneMasked: '077****567' });
  });

  test('first saved method becomes the default; limit of five is enforced', async () => {
    prisma.savedPaymentMethod.findMany.mockResolvedValue([]);
    prisma.savedPaymentMethod.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'sm-1', ...data }));
    const ok = await request(app).post('/api/v2/payment-methods').set(auth()).send({ type: 'ECOCASH', phone: '0771234567', label: 'Mine' });
    expect(ok.status).toBe(201);
    expect(prisma.savedPaymentMethod.create.mock.calls[0][0].data).toMatchObject({ memberId: 'member-1', isDefault: true });

    prisma.savedPaymentMethod.findMany.mockResolvedValue(Array.from({ length: 5 }, (_, i) => ({ id: String(i) })));
    expect((await request(app).post('/api/v2/payment-methods').set(auth()).send({ type: 'ONEMONEY', phone: '0711234567', label: 'Sixth' })).status).toBe(400);
  });

  test("cannot delete someone else's method", async () => {
    prisma.savedPaymentMethod.findUnique.mockResolvedValue({ id: 'sm-1', memberId: 'member-2' });
    expect((await request(app).delete('/api/v2/payment-methods/sm-1').set(auth())).status).toBe(404);
    expect(prisma.savedPaymentMethod.delete).not.toHaveBeenCalled();
  });
});
