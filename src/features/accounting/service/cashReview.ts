import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { logger } from '@/config/logger';
import { prisma } from '@/database';
import type { AuthorizedUser } from '@/types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/types/errors';
import { require } from './ledger';
import { D, toNumber } from './money';

/**
 * Cash session review. States: OPEN -> SUBMITTED -> (REJECTED -> SUBMITTED ...) -> RECONCILED.
 *  - Every transition is a compare-and-set, so two people can never both approve, and a reviewer can only act on the
 *    exact submission they looked at (submissionNo).
 *  - Totals are computed on the server from receipts attached to THIS session, per currency. Only CASH counts toward
 *    the physical count; mobile money and bank receipts are listed separately.
 *  - Approval records custody of cash. It writes NOTHING to the ledger: income was recognised when each receipt was
 *    recorded, so approving a handover can never recognise it a second time.
 *  - Rejecting never unlocks receipts. Wrong receipts are fixed with the existing void/reversal route, then resubmitted.
 */
const currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);
const amount = z.number().finite().min(0).max(1e12);
export const SubmitSchema = z.object({
  counts: z.array(z.object({ currency, counted: amount, denominations: z.record(z.string().regex(/^\d+(\.\d{1,2})?$/), z.number().int().min(0).max(1e7)).optional() }).strict()).min(1).max(10),
  cashPaidOut: amount.default(0),
  notes: z.string().trim().max(1000).optional(),
}).strict();
export const RejectSchema = z.object({ submissionNo: z.number().int().min(1), reason: z.string().trim().min(5).max(1000) }).strict();
export const ApproveSchema = z.object({
  submissionNo: z.number().int().min(1),
  received: z.array(z.object({ currency, amount }).strict()).min(1).max(10),
  note: z.string().trim().max(1000).optional(),
}).strict();

type Client = Pick<typeof prisma, 'receipt'>;
type Snapshot = { currency: string; opening: string; cashPaidOut: string; receiptCount: number; cashReceipts: Record<string, string>; expected: Record<string, string>; other: Record<string, string>; categories: Record<string, string> };

async function totals(client: Client, session: { id: string; currency: string; openingBalance: Prisma.Decimal.Value }, cashPaidOut: Prisma.Decimal.Value): Promise<Snapshot> {
  const groups = (await client.receipt.groupBy({
    by: ['currency', 'paymentMethod', 'incomeType'], where: { cashSessionId: session.id, status: 'ISSUED' }, _sum: { amount: true }, _count: { _all: true },
  } as never)) as unknown as Array<{ currency: string; paymentMethod: string; incomeType: string; _sum: { amount: Prisma.Decimal | null }; _count: { _all: number } }>;
  const cash: Record<string, Prisma.Decimal> = {};
  const other: Record<string, Prisma.Decimal> = {};
  const categories: Record<string, Prisma.Decimal> = {};
  let count = 0;
  for (const g of groups) {
    const v = D(g._sum.amount ?? 0);
    count += g._count._all;
    const bucket = g.paymentMethod === 'CASH' ? cash : other;
    const key = g.paymentMethod === 'CASH' ? g.currency : `${g.paymentMethod}:${g.currency}`;
    bucket[key] = (bucket[key] ?? D(0)).plus(v);
    categories[`${g.incomeType}:${g.currency}`] = (categories[`${g.incomeType}:${g.currency}`] ?? D(0)).plus(v);
  }
  // Expected physical cash = opening float + cash receipts - cash paid out. The float and payouts are in the session currency only;
  // currencies are never added together.
  const currencies = new Set([...Object.keys(cash), session.currency]);
  const expected: Record<string, string> = {};
  for (const c of currencies) {
    let e = cash[c] ?? D(0);
    if (c === session.currency) e = e.plus(session.openingBalance).minus(cashPaidOut);
    expected[c] = e.toFixed(2);
  }
  const fix = (o: Record<string, Prisma.Decimal>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.toFixed(2)]));
  return { currency: session.currency, opening: D(session.openingBalance).toFixed(2), cashPaidOut: D(cashPaidOut).toFixed(2), receiptCount: count, cashReceipts: fix(cash), expected, other: fix(other), categories: fix(categories) };
}

const parse = <T>(s: string | null | undefined): T | null => { try { return s ? (JSON.parse(s) as T) : null; } catch { return null; } };

export class CashReviewService {
  async submit(user: AuthorizedUser, id: string, raw: unknown) {
    require(user, 'finance:cash_session:manage');
    const input = SubmitSchema.parse(raw);
    const session = await this.owned(user, id);
    if (!user.memberId || session.handledBy !== user.memberId) throw new ForbiddenError('Only the cashier who opened this session can submit it');
    if (!['OPEN', 'REJECTED'].includes(session.status)) throw new ConflictError(`A ${session.status.toLowerCase()} session cannot be submitted`);

    const seen = new Set<string>();
    for (const c of input.counts) {
      if (seen.has(c.currency)) throw new ValidationError(`${c.currency} is counted twice`);
      seen.add(c.currency);
      if (c.denominations) {
        const sum = Object.entries(c.denominations).reduce((a, [d, q]) => a.plus(D(d).times(q)), D(0));
        if (!sum.equals(D(c.counted))) throw new ValidationError(`${c.currency}: the denominations add up to ${sum.toFixed(2)} but the count is ${D(c.counted).toFixed(2)}`);
      }
    }
    const before = await totals(prisma, session, input.cashPaidOut);
    const missing = Object.keys(before.expected).filter((c) => !seen.has(c) && !D(before.expected[c]).isZero());
    if (missing.length) throw new ValidationError(`Count the cash for: ${missing.join(', ')}`);
    const variances = Object.fromEntries(input.counts.map((c) => [c.currency, D(c.counted).minus(before.expected[c.currency] ?? 0).toFixed(2)]));
    if (Object.values(variances).some((v) => !D(v).isZero()) && !input.notes?.trim()) {
      throw new ValidationError(`The count does not match (${Object.entries(variances).filter(([, v]) => !D(v).isZero()).map(([c, v]) => `${c} ${D(v).isPositive() ? 'over' : 'short'} ${D(v).abs().toFixed(2)}`).join(', ')}). Explain the difference in the notes.`);
    }

    const next = session.submissionNo + 1;
    await prisma.$transaction(async (tx) => {
      // Flip first, then recompute inside the same transaction: a receipt that slipped in meanwhile makes the totals differ and the whole submit rolls back.
      const flipped = await tx.cashSession.updateMany({
        where: { id, status: session.status },
        data: { status: 'SUBMITTED', submittedAt: new Date(), submittedBy: user.id, submissionNo: next, countsJson: JSON.stringify({ counts: input.counts, cashPaidOut: input.cashPaidOut, notes: input.notes ?? null, variances }), reviewNote: null },
      });
      if (flipped.count === 0) throw new ConflictError('This session changed while you were submitting it; reload and try again');
      const after = await totals(tx, session, input.cashPaidOut);
      if (JSON.stringify(after) !== JSON.stringify(before)) throw new ConflictError('A receipt was recorded while you were submitting. Check the totals and submit again.');
      await tx.cashSession.update({ where: { id }, data: { snapshotJson: JSON.stringify(after) } });
      await tx.cashSessionEvent.create({ data: { sessionId: id, action: 'SUBMITTED', actorId: user.id, note: input.notes ?? null, data: JSON.stringify({ submissionNo: next, counts: input.counts, variances, snapshot: after }) } });
    });
    await this.audit(user, 'CASH_SESSION_SUBMITTED', id, { submissionNo: next, variances });
    return { id, status: 'SUBMITTED', submissionNo: next, snapshot: before, variances };
  }

  async queue(user: AuthorizedUser) {
    require(user, 'finance:cash_session:review');
    const rows = await prisma.cashSession.findMany({ where: { churchId: user.churchId, status: 'SUBMITTED' }, orderBy: { submittedAt: 'asc' }, take: 100 });
    return rows.map((s) => {
      const snap = parse<Snapshot>(s.snapshotJson);
      const counts = parse<{ variances: Record<string, string> }>(s.countsJson);
      return {
        id: s.id, cashier: s.handledBy, submittedAt: s.submittedAt, submissionNo: s.submissionNo, expected: snap?.expected ?? {}, receiptCount: snap?.receiptCount ?? 0,
        discrepancy: Object.values(counts?.variances ?? {}).some((v) => !D(v).isZero()),
        // The reviewer's own sessions are flagged so the UI can explain why approve is unavailable.
        ownSession: !!user.memberId && s.handledBy === user.memberId,
      };
    });
  }

  async detail(user: AuthorizedUser, id: string) {
    const session = await this.owned(user, id);
    const isOwner = !!user.memberId && session.handledBy === user.memberId;
    if (!(user.permissions.includes('finance:cash_session:review') || (isOwner && user.permissions.includes('finance:cash_session:manage')))) {
      throw new ForbiddenError('Forbidden: finance:cash_session:review permission required');
    }
    const [receipts, events] = await Promise.all([
      prisma.receipt.findMany({ where: { cashSessionId: id }, orderBy: { recordedAt: 'asc' }, take: 500, select: { receiptNumber: true, amount: true, currency: true, paymentMethod: true, incomeType: true, status: true, recordedAt: true } }),
      prisma.cashSessionEvent.findMany({ where: { sessionId: id }, orderBy: { createdAt: 'asc' } }),
    ]);
    const live = await totals(prisma, session, parse<{ cashPaidOut: number }>(session.countsJson)?.cashPaidOut ?? 0);
    const submitted = parse<Snapshot>(session.snapshotJson);
    return {
      id: session.id, status: session.status, cashier: session.handledBy, submissionNo: session.submissionNo, submittedAt: session.submittedAt, reviewedAt: session.reviewedAt, reviewNote: session.reviewNote,
      submission: parse(session.countsJson), snapshot: submitted, live,
      // If receipts changed after submission this is true and approval will be refused.
      changedSinceSubmission: !!submitted && session.status === 'SUBMITTED' && JSON.stringify(submitted) !== JSON.stringify(live),
      receipts: receipts.map((r) => ({ ...r, amount: toNumber(r.amount) })),
      history: events.map((e) => ({ action: e.action, at: e.createdAt, by: e.actorId, note: e.note, data: parse(e.data) })),
    };
  }

  async reject(user: AuthorizedUser, id: string, raw: unknown) {
    require(user, 'finance:cash_session:review');
    const input = RejectSchema.parse(raw);
    const session = await this.owned(user, id);
    this.noSelfReview(user, session);
    await prisma.$transaction(async (tx) => {
      const res = await tx.cashSession.updateMany({ where: { id, status: 'SUBMITTED', submissionNo: input.submissionNo }, data: { status: 'REJECTED', reviewedAt: new Date(), reviewedBy: user.id, reviewNote: input.reason } });
      if (res.count === 0) throw new ConflictError('This submission is no longer awaiting review (it was already reviewed or resubmitted)');
      await tx.cashSessionEvent.create({ data: { sessionId: id, action: 'REJECTED', actorId: user.id, note: input.reason, data: JSON.stringify({ submissionNo: input.submissionNo }) } });
    });
    await this.audit(user, 'CASH_SESSION_REJECTED', id, { submissionNo: input.submissionNo, reason: input.reason });
    return { id, status: 'REJECTED' };
  }

  async approve(user: AuthorizedUser, id: string, raw: unknown) {
    require(user, 'finance:cash_session:review');
    const input = ApproveSchema.parse(raw);
    const session = await this.owned(user, id);
    this.noSelfReview(user, session);
    if (session.status !== 'SUBMITTED') throw new ConflictError(`A ${session.status.toLowerCase()} session cannot be approved`);
    const snap = parse<Snapshot>(session.snapshotJson);
    const sub = parse<{ counts: { currency: string; counted: number }[]; cashPaidOut: number }>(session.countsJson);
    if (!snap || !sub) throw new ConflictError('This session has no submission to approve');

    // The reviewer must enter what they actually received for every counted currency; it is never pre-filled from the cashier's figure.
    const received = new Map(input.received.map((r) => [r.currency, D(r.amount)]));
    const diffs: Record<string, string> = {};
    for (const c of sub.counts) {
      const r = received.get(c.currency);
      if (!r) throw new ValidationError(`Enter the cash you received for ${c.currency}`);
      const d = r.minus(c.counted);
      if (!d.isZero()) diffs[c.currency] = d.toFixed(2);
    }
    if (Object.keys(diffs).length && !input.note?.trim()) throw new ValidationError(`The cash received differs from the cashier's count (${Object.entries(diffs).map(([c, v]) => `${c} ${v}`).join(', ')}). Record a note, or reject the session.`);

    await prisma.$transaction(async (tx) => {
      const res = await tx.cashSession.updateMany({
        where: { id, status: 'SUBMITTED', submissionNo: input.submissionNo },
        data: { status: 'RECONCILED', reviewedAt: new Date(), reviewedBy: user.id, reviewNote: input.note ?? null, closedAt: new Date(), closedBy: user.id },
      });
      if (res.count === 0) throw new ConflictError('This submission is no longer awaiting review (it was already reviewed or resubmitted)');
      // Receipts must still be what was submitted; otherwise the approval would cover money nobody counted.
      const live = await totals(tx, session, sub.cashPaidOut);
      if (JSON.stringify(live) !== JSON.stringify(snap)) throw new ConflictError('Receipts changed after submission. Reject the session so the cashier can resubmit.');
      await tx.cashSessionEvent.create({ data: { sessionId: id, action: 'APPROVED', actorId: user.id, note: input.note ?? null, data: JSON.stringify({ submissionNo: input.submissionNo, received: input.received, differences: diffs }) } });
    });
    await this.audit(user, 'CASH_SESSION_APPROVED', id, { submissionNo: input.submissionNo, differences: diffs });
    return { id, status: 'RECONCILED', differences: diffs };
  }

  /** Holding both the cashier and reviewer roles never lets someone approve their own handover. */
  private noSelfReview(user: AuthorizedUser, s: { handledBy: string; submittedBy: string | null }) {
    if ((user.memberId && s.handledBy === user.memberId) || s.submittedBy === user.id) throw new ForbiddenError('You cannot review a cash session you handled or submitted');
  }

  private async owned(user: AuthorizedUser, id: string) {
    const s = await prisma.cashSession.findUnique({ where: { id } });
    if (!s || s.churchId !== user.churchId) throw new NotFoundError('Cash session');
    return s;
  }

  private async audit(user: AuthorizedUser, action: string, entityId: string, details: Record<string, unknown>) {
    try {
      await prisma.auditLog.create({ data: { churchId: user.churchId, action, entityType: 'CASH_SESSION', entityId, actorId: user.memberId ?? user.id, changes: JSON.stringify(details) } });
    } catch (error) { logger.error({ err: error, action }, 'Failed to write cash review audit log'); }
  }
}
export const cashReviewService = new CashReviewService();
