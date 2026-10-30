import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/database';
import { logger } from '@/config/logger';
import { notificationDispatcher } from '@/services/notifications';
import { paymentGateway, type PaymentGateway } from '@/services/payments';
import type { StatusResult } from '@/services/payments/gateways/types';
import type { AuthorizedUser } from '@/types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/types/errors';
import { paymentRepository as repository, type PaymentRecord } from '../repository';
import type {
  CreatePledgeInput,
  CreateRecurringInput,
  CreateSavedMethodInput,
  InitiatePaymentInput,
  ListQuery,
} from '../types';

const PENDING_EXPIRY_MS = 24 * 60 * 60 * 1000;
const currency = () => process.env.PAYMENT_CURRENCY || 'USD';
const toNumber = (value: Prisma.Decimal.Value) => Number(new Prisma.Decimal(value).toFixed(2));
const amountString = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value).toFixed(2);

export function toPaymentView(p: PaymentRecord) {
  return {
    id: p.id,
    reference: p.reference,
    amount: toNumber(p.amount),
    currency: p.currency,
    incomeType: p.incomeType,
    method: p.method,
    status: p.status,
    failureReason: p.status === 'FAILED' || p.status === 'CANCELLED' ? p.failureReason : null,
    fundName: p.fund.name,
    pledgeId: p.pledgeId,
    // Only useful while the member still has something to do.
    redirectUrl: p.status === 'PENDING' ? p.redirectUrl : null,
    instructions: p.status === 'PENDING' ? p.instructions : null,
    receiptNumber: p.receipt?.receiptNumber ?? null,
    createdAt: p.createdAt,
    paidAt: p.paidAt,
  };
}

type StartPayment = {
  churchId: string;
  memberId: string;
  fundId: string;
  amount: Prisma.Decimal.Value;
  incomeType: string;
  method: 'ECOCASH' | 'ONEMONEY' | 'WEB';
  phone?: string;
  pledgeId?: string;
  recurringGivingId?: string;
};

export class PaymentService {
  constructor(private readonly gateway: PaymentGateway = paymentGateway) {}

  private requireMemberId(user: AuthorizedUser): string {
    if (!user.memberId) throw new ForbiddenError('Forbidden: your account is not linked to a member profile');
    return user.memberId;
  }

  /** Funds a member can give to; names and descriptions only, never balances. */
  listFunds(user: AuthorizedUser) {
    return repository.listFunds(user.churchId);
  }

  // ------------------------------------------------------------- initiating

  async initiate(user: AuthorizedUser, input: InitiatePaymentInput) {
    const memberId = this.requireMemberId(user);

    let phone = input.phone;
    let method = input.method;
    if (input.savedMethodId) {
      const saved = await repository.findSavedMethod(input.savedMethodId);
      if (!saved || saved.memberId !== memberId) throw new NotFoundError('Saved payment method');
      phone = saved.phone;
      method = saved.type as 'ECOCASH' | 'ONEMONEY';
    }

    if (input.pledgeId) {
      const pledge = await repository.findPledge(input.pledgeId);
      if (!pledge || pledge.memberId !== memberId) throw new NotFoundError('Pledge');
      if (pledge.status !== 'ACTIVE') throw new ConflictError(`Pledge is ${pledge.status.toLowerCase()}`);
    }

    const payment = await this.start({
      churchId: user.churchId,
      memberId,
      fundId: input.fundId,
      amount: input.amount,
      incomeType: input.incomeType,
      method,
      phone: method === 'WEB' ? undefined : phone,
      pledgeId: input.pledgeId,
    });
    return toPaymentView(payment);
  }

  /** Records the payment locally first so a gateway callback can never arrive for an unknown reference. */
  private async start(params: StartPayment): Promise<PaymentRecord> {
    const [fund, member] = await Promise.all([repository.findFund(params.churchId, params.fundId), repository.findMember(params.memberId)]);
    if (!fund) throw new NotFoundError('Fund');
    if (!member) throw new NotFoundError('Member profile');

    const amount = new Prisma.Decimal(params.amount);
    const reference = `ECC-${randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()}`;
    const created = await repository.createPayment({
      churchId: params.churchId,
      memberId: params.memberId,
      fundId: params.fundId,
      pledgeId: params.pledgeId ?? null,
      recurringGivingId: params.recurringGivingId ?? null,
      amount,
      currency: currency(),
      incomeType: params.incomeType,
      gateway: this.gateway.name,
      method: params.method,
      phone: params.phone ?? null,
      reference,
      status: 'PENDING',
    });

    try {
      const result = await this.gateway.initiate({
        reference,
        amount: amountString(amount),
        description: `${params.incomeType.toLowerCase()} - ${fund.name}`,
        email: member.email || process.env.PAYNOW_AUTH_EMAIL || 'giving@ecclesia.local',
        method: params.method,
        phone: params.phone,
      });
      return repository.updatePayment(created.id, {
        gatewayRef: result.gatewayRef ?? null,
        pollUrl: result.pollUrl,
        redirectUrl: result.redirectUrl ?? null,
        instructions: result.instructions ?? null,
      });
    } catch (error) {
      await repository.updatePayment(created.id, { status: 'FAILED', failureReason: 'Could not reach the payment gateway' });
      throw error;
    }
  }

  // --------------------------------------------------------------- reading

  async getPayment(user: AuthorizedUser, id: string) {
    const payment = await repository.findPayment(id);
    const canSeeAll = user.permissions.includes('payment:view:all');
    const visible = payment && payment.churchId === user.churchId && (payment.memberId === user.memberId || canSeeAll);
    if (!payment || !visible) throw new NotFoundError('Payment');
    return toPaymentView(await this.refresh(payment));
  }

  async listMine(user: AuthorizedUser, query: ListQuery) {
    const memberId = this.requireMemberId(user);
    return this.list({ memberId, ...(query.status ? { status: query.status } : {}) }, query);
  }

  async listAll(user: AuthorizedUser, query: ListQuery) {
    if (!user.permissions.includes('payment:view:all')) throw new ForbiddenError('Forbidden: payment:view:all permission required');
    return this.list({ churchId: user.churchId, ...(query.status ? { status: query.status } : {}) }, query);
  }

  private async list(where: Prisma.PaymentWhereInput, query: ListQuery) {
    const [rows, total] = await repository.listPayments(where, (query.page - 1) * query.pageSize, query.pageSize);
    return { items: rows.map(toPaymentView), total, page: query.page, pageSize: query.pageSize };
  }

  /** Asks the gateway about a pending payment so the member sees the outcome even if the callback was late or lost. */
  private async refresh(payment: PaymentRecord): Promise<PaymentRecord> {
    if (payment.status !== 'PENDING' || !payment.pollUrl) return payment;
    try {
      const result = await this.gateway.poll(payment.pollUrl);
      if (result.reference !== payment.reference) throw new Error('Gateway returned a different reference');
      const updated = await this.applyStatus(payment, result);
      if (updated.status === 'PENDING' && Date.now() - payment.createdAt.getTime() > PENDING_EXPIRY_MS) {
        return repository.updatePayment(payment.id, { status: 'FAILED', failureReason: 'Payment expired before it was approved' });
      }
      return updated;
    } catch (error) {
      logger.warn({ err: error, paymentId: payment.id }, 'Could not refresh pending payment');
      return payment;
    }
  }

  // ------------------------------------------------------------- settlement

  /** Gateway callback. The signature is verified by the gateway adapter; the amount is re-checked here. */
  async handleWebhook(body: Record<string, string>): Promise<void> {
    const result = this.gateway.parseWebhook(body);
    const payment = await repository.findPaymentByReference(result.reference);
    if (!payment) {
      logger.warn({ reference: result.reference }, 'Webhook for unknown payment reference');
      return;
    }
    await this.applyStatus(payment, result);
  }

  private async applyStatus(payment: PaymentRecord, result: StatusResult): Promise<PaymentRecord> {
    if (payment.status !== 'PENDING' || result.status === 'PENDING') return payment;

    if (result.status !== 'COMPLETED') {
      await prisma.payment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: { status: result.status, failureReason: result.rawStatus, gatewayRef: result.gatewayRef ?? payment.gatewayRef },
      });
      return (await repository.findPayment(payment.id)) ?? payment;
    }

    if (!result.amount || !new Prisma.Decimal(payment.amount).equals(new Prisma.Decimal(result.amount))) {
      logger.error({ paymentId: payment.id, expected: payment.amount.toString(), reported: result.amount }, 'Payment amount mismatch');
      await prisma.payment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: { status: 'FAILED', failureReason: 'Amount reported by the gateway did not match' },
      });
      return (await repository.findPayment(payment.id)) ?? payment;
    }

    const settled = await prisma.$transaction(async (tx) => {
      // Only one caller (webhook or poll) can move the payment out of PENDING.
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: { status: 'COMPLETED', paidAt: new Date(), gatewayRef: result.gatewayRef ?? payment.gatewayRef, failureReason: null },
      });
      if (claimed.count === 0) return false;

      const receipt = await tx.receipt.create({
        data: {
          churchId: payment.churchId,
          fundId: payment.fundId,
          memberId: payment.memberId,
          financialAccountId: payment.fund.accountId,
          amount: payment.amount,
          currency: payment.currency,
          incomeType: payment.incomeType,
          paymentMethod: payment.method === 'WEB' ? 'ONLINE' : 'MOBILE_MONEY',
          receiptNumber: `ON-${payment.reference}`,
          status: 'ISSUED',
          recordedBy: null,
        },
      });
      await tx.payment.update({ where: { id: payment.id }, data: { receiptId: receipt.id } });

      if (payment.pledgeId) {
        const [pledge, paid] = await Promise.all([
          tx.pledge.findUnique({ where: { id: payment.pledgeId } }),
          tx.payment.aggregate({ where: { pledgeId: payment.pledgeId, status: 'COMPLETED' }, _sum: { amount: true } }),
        ]);
        if (pledge && pledge.status === 'ACTIVE' && new Prisma.Decimal(paid._sum.amount ?? 0).gte(pledge.targetAmount)) {
          await tx.pledge.update({ where: { id: pledge.id }, data: { status: 'FULFILLED' } });
        }
      }
      return true;
    });

    if (settled) await this.notifyReceived(payment);
    return (await repository.findPayment(payment.id)) ?? payment;
  }

  private async notifyReceived(payment: PaymentRecord): Promise<void> {
    await notificationDispatcher.notify(payment.memberId, {
      churchId: payment.churchId,
      category: 'GIVING',
      type: 'PAYMENT_RECEIVED',
      title: 'Thank you for your gift',
      body: `We received your ${payment.currency} ${amountString(payment.amount)} to ${payment.fund.name}. Receipt ON-${payment.reference}.`,
      channels: ['IN_APP', 'EMAIL'],
      entityType: 'PAYMENT',
      entityId: payment.id,
    });
  }

  // ----------------------------------------------------------------- pledges

  async createPledge(user: AuthorizedUser, input: CreatePledgeInput) {
    const memberId = this.requireMemberId(user);
    if (!(await repository.findFund(user.churchId, input.fundId))) throw new NotFoundError('Fund');
    const pledge = await repository.createPledge({
      churchId: user.churchId,
      memberId,
      fundId: input.fundId,
      name: input.name,
      targetAmount: new Prisma.Decimal(input.targetAmount),
      currency: currency(),
      endDate: input.endDate ?? null,
    });
    return this.getPledge(user, pledge.id);
  }

  async listPledges(user: AuthorizedUser, query: ListQuery, scope: 'mine' | 'all') {
    if (scope === 'all' && !user.permissions.includes('pledge:view:all')) throw new ForbiddenError('Forbidden: pledge:view:all permission required');
    const where: Prisma.PledgeWhereInput = scope === 'all' ? { churchId: user.churchId } : { memberId: this.requireMemberId(user) };
    const [rows, total] = await repository.listPledges(where, (query.page - 1) * query.pageSize, query.pageSize);
    return {
      items: rows.map((p) => this.pledgeView(p, p.payments.map((x) => x.amount))),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getPledge(user: AuthorizedUser, id: string) {
    const pledge = await repository.findPledge(id);
    const canSeeAll = user.permissions.includes('pledge:view:all');
    if (!pledge || pledge.churchId !== user.churchId || (pledge.memberId !== user.memberId && !canSeeAll)) throw new NotFoundError('Pledge');
    return {
      ...this.pledgeView(pledge, pledge.payments.map((p) => p.amount)),
      payments: pledge.payments.map((p) => ({ id: p.id, amount: toNumber(p.amount), currency: p.currency, paidAt: p.paidAt })),
    };
  }

  async cancelPledge(user: AuthorizedUser, id: string) {
    const memberId = this.requireMemberId(user);
    const pledge = await repository.findPledge(id);
    if (!pledge || pledge.memberId !== memberId) throw new NotFoundError('Pledge');
    if (pledge.status !== 'ACTIVE') throw new ConflictError(`Pledge is already ${pledge.status.toLowerCase()}`);
    await repository.updatePledge(id, { status: 'CANCELLED' });
    return this.getPledge(user, id);
  }

  private pledgeView(
    p: { id: string; name: string; targetAmount: Prisma.Decimal.Value; currency: string; status: string; startDate: Date; endDate: Date | null; fundId: string; fund: { name: string } },
    paidAmounts: Prisma.Decimal.Value[]
  ) {
    const paid = paidAmounts.reduce<Prisma.Decimal>((sum, a) => sum.plus(a), new Prisma.Decimal(0));
    const remaining = Prisma.Decimal.max(new Prisma.Decimal(p.targetAmount).minus(paid), 0);
    return {
      id: p.id,
      name: p.name,
      fundId: p.fundId,
      fundName: p.fund.name,
      targetAmount: toNumber(p.targetAmount),
      paidAmount: toNumber(paid),
      remainingAmount: toNumber(remaining),
      currency: p.currency,
      status: p.status,
      startDate: p.startDate,
      endDate: p.endDate,
    };
  }

  // --------------------------------------------------------------- recurring

  async createRecurring(user: AuthorizedUser, input: CreateRecurringInput) {
    const memberId = this.requireMemberId(user);
    if (!(await repository.findFund(user.churchId, input.fundId))) throw new NotFoundError('Fund');
    const created = await repository.createRecurring({
      churchId: user.churchId,
      memberId,
      fundId: input.fundId,
      amount: new Prisma.Decimal(input.amount),
      currency: currency(),
      incomeType: input.incomeType,
      frequency: input.frequency,
      method: input.method,
      phone: input.phone,
      nextChargeDate: input.startDate ?? new Date(),
    });
    return this.recurringView(created);
  }

  async listRecurring(user: AuthorizedUser) {
    const rows = await repository.listRecurringForMember(this.requireMemberId(user));
    return rows.map((r) => this.recurringView(r));
  }

  async setRecurringActive(user: AuthorizedUser, id: string, isActive: boolean) {
    const memberId = this.requireMemberId(user);
    const existing = await repository.findRecurring(id);
    if (!existing || existing.memberId !== memberId) throw new NotFoundError('Recurring giving');
    return this.recurringView(await repository.updateRecurring(id, { isActive }));
  }

  /**
   * Starts a payment for every active schedule that is due. Mobile money still needs the member to approve the
   * prompt on their phone, so each run only sends the request; settlement follows the normal webhook path.
   */
  async runDueRecurring(user: AuthorizedUser, now = new Date()) {
    if (!user.permissions.includes('recurring:manage')) throw new ForbiddenError('Forbidden: recurring:manage permission required');
    const due = await repository.listDueRecurring(user.churchId, now);
    let started = 0;
    let failed = 0;
    for (const schedule of due) {
      try {
        await this.start({
          churchId: schedule.churchId,
          memberId: schedule.memberId,
          fundId: schedule.fundId,
          amount: schedule.amount,
          incomeType: schedule.incomeType,
          method: schedule.method as 'ECOCASH' | 'ONEMONEY',
          phone: schedule.phone,
          recurringGivingId: schedule.id,
        });
        started += 1;
      } catch (error) {
        failed += 1;
        logger.error({ err: error, recurringGivingId: schedule.id }, 'Recurring giving charge failed to start');
      }
      // Advance either way so one failing schedule is not retried in a tight loop.
      await repository.updateRecurring(schedule.id, { nextChargeDate: this.nextDate(schedule.nextChargeDate, schedule.frequency, now) });
    }
    return { due: due.length, started, failed };
  }

  private nextDate(from: Date, frequency: string, now: Date): Date {
    const next = new Date(from);
    do {
      if (frequency === 'WEEKLY') next.setUTCDate(next.getUTCDate() + 7);
      else next.setUTCMonth(next.getUTCMonth() + 1);
    } while (next <= now);
    return next;
  }

  private recurringView(r: { id: string; amount: Prisma.Decimal.Value; currency: string; incomeType: string; frequency: string; method: string; phone: string; nextChargeDate: Date; isActive: boolean; fundId: string; fund: { name: string } }) {
    return {
      id: r.id,
      fundId: r.fundId,
      fundName: r.fund.name,
      amount: toNumber(r.amount),
      currency: r.currency,
      incomeType: r.incomeType,
      frequency: r.frequency,
      method: r.method,
      phone: `${r.phone.slice(0, 3)}****${r.phone.slice(-3)}`,
      nextChargeDate: r.nextChargeDate,
      isActive: r.isActive,
    };
  }

  // ----------------------------------------------------------- saved methods

  async listSavedMethods(user: AuthorizedUser) {
    const rows = await repository.listSavedMethods(this.requireMemberId(user));
    return rows.map((m) => this.savedMethodView(m));
  }

  async createSavedMethod(user: AuthorizedUser, input: CreateSavedMethodInput) {
    const memberId = this.requireMemberId(user);
    const existing = await repository.listSavedMethods(memberId);
    if (existing.length >= 5) throw new ValidationError('You can save at most 5 payment methods');
    return this.savedMethodView(await repository.createSavedMethod({ memberId, ...input, isDefault: input.isDefault || existing.length === 0 }));
  }

  async deleteSavedMethod(user: AuthorizedUser, id: string) {
    const memberId = this.requireMemberId(user);
    const method = await repository.findSavedMethod(id);
    if (!method || method.memberId !== memberId) throw new NotFoundError('Saved payment method');
    await repository.deleteSavedMethod(id);
  }

  private savedMethodView(m: { id: string; type: string; phone: string; label: string; isDefault: boolean }) {
    return { id: m.id, type: m.type, label: m.label, isDefault: m.isDefault, phoneMasked: `${m.phone.slice(0, 3)}****${m.phone.slice(-3)}` };
  }
}

export const paymentService = new PaymentService();
