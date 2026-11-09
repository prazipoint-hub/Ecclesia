import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { logger } from '@/config/logger';
import { prisma } from '@/database';
import type { AuthorizedUser } from '@/types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/types/errors';
import { require } from './ledger';
import { D, toNumber } from './money';

/**
 * Cash deposits. A deposit is NOT income: income was recognised when each receipt was recorded. It moves value from
 * Cash on Hand (1000) to Bank (1100). The person who records it cannot verify it, and the ledger entry is written in
 * the same transaction as the PENDING -> VERIFIED flip, so a deposit can never be posted twice or half-posted.
 */
const currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);
export const RecordDepositSchema = z.object({
  currency,
  amount: z.number().finite().positive().max(1e12),
  depositDate: z.coerce.date(),
  bankReference: z.string().trim().min(3).max(100),
  bankName: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(1000).optional(),
}).strict();
export const RejectDepositSchema = z.object({ reason: z.string().trim().min(5).max(1000) }).strict();

const parse = <T>(s: string | null | undefined): T | null => { try { return s ? (JSON.parse(s) as T) : null; } catch { return null; } };
type Snap = { cashReceipts?: Record<string, string> };
const add = (o: Record<string, Prisma.Decimal>, k: string, v: Prisma.Decimal.Value) => { o[k] = (o[k] ?? D(0)).plus(v); };
const fix = (o: Record<string, Prisma.Decimal>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.toFixed(2)]));

export class DepositService {
  async record(user: AuthorizedUser, raw: unknown, idempotencyKey?: string) {
    require(user, 'finance:deposit:record');
    const input = RecordDepositSchema.parse(raw);
    if (input.depositDate.getTime() > Date.now() + 86_400_000) throw new ValidationError('The deposit date cannot be in the future');
    if (idempotencyKey) {
      const prior = await prisma.deposit.findFirst({ where: { churchId: user.churchId, idempotencyKey } });
      if (prior) return { ...this.view(prior), replayed: true };
    }
    try {
      const row = await prisma.deposit.create({
        data: { churchId: user.churchId, currency: input.currency, amount: D(input.amount), depositDate: input.depositDate, bankReference: input.bankReference, bankName: input.bankName ?? null, notes: input.notes ?? null, idempotencyKey: idempotencyKey ?? null, recordedBy: user.id },
      });
      await this.audit(user, 'DEPOSIT_RECORDED', row.id, { currency: row.currency, amount: toNumber(row.amount) });
      return this.view(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        if (String(error.meta?.target).includes('idempotencyKey') && idempotencyKey) {
          const prior = await prisma.deposit.findFirst({ where: { churchId: user.churchId, idempotencyKey } });
          if (prior) return { ...this.view(prior), replayed: true };
        }
        throw new ConflictError('A deposit with this bank reference is already recorded');
      }
      throw error;
    }
  }

  async list(user: AuthorizedUser, status?: string) {
    require(user, 'finance:view');
    const where: Prisma.DepositWhereInput = { churchId: user.churchId, ...(status && ['PENDING', 'VERIFIED', 'REJECTED'].includes(status) ? { status } : {}) };
    const rows = await prisma.deposit.findMany({ where, orderBy: { depositDate: 'desc' }, take: 200 });
    return rows.map((r) => this.view(r));
  }

  async reject(user: AuthorizedUser, id: string, raw: unknown) {
    require(user, 'finance:deposit:verify');
    const { reason } = RejectDepositSchema.parse(raw);
    const dep = await this.owned(user, id);
    this.noSelf(user, dep.recordedBy);
    const res = await prisma.deposit.updateMany({ where: { id, churchId: user.churchId, status: 'PENDING' }, data: { status: 'REJECTED', verifiedBy: user.id, verifiedAt: new Date(), rejectReason: reason } });
    if (res.count === 0) throw new ConflictError('This deposit was already reviewed');
    await this.audit(user, 'DEPOSIT_REJECTED', id, { reason });
    return { id, status: 'REJECTED' };
  }

  async verify(user: AuthorizedUser, id: string) {
    require(user, 'finance:deposit:verify');
    const dep = await this.owned(user, id);
    this.noSelf(user, dep.recordedBy);
    if (dep.status !== 'PENDING') throw new ConflictError(`A ${dep.status.toLowerCase()} deposit cannot be verified`);

    const accounts = await prisma.ledgerAccount.findMany({ where: { churchId: user.churchId, code: { in: ['1000', '1100'] } } });
    const cash = accounts.find((a) => a.code === '1000');
    const bank = accounts.find((a) => a.code === '1100');
    if (!cash || !bank) throw new ValidationError('Add the default chart of accounts (1000 Cash on Hand, 1100 Bank) before verifying deposits');
    if (!cash.isActive || !bank.isActive) throw new ValidationError('The cash and bank accounts must be active');
    const period = await prisma.financialPeriod.findFirst({ where: { churchId: user.churchId, startDate: { lte: dep.depositDate }, endDate: { gte: dep.depositDate } } });
    if (period?.status === 'CLOSED') throw new ConflictError(`The period "${period.name}" is closed; the deposit cannot be posted into it`);

    const prefix = `JE-${new Date().getUTCFullYear()}-`;
    for (let attempt = 0; ; attempt += 1) {
      try {
        const entry = await prisma.$transaction(async (tx) => {
          const claimed = await tx.deposit.updateMany({ where: { id, churchId: user.churchId, status: 'PENDING' }, data: { status: 'VERIFIED', verifiedBy: user.id, verifiedAt: new Date() } });
          if (claimed.count === 0) throw new ConflictError('This deposit was already reviewed');
          const count = await tx.journalEntry.count({ where: { churchId: user.churchId, reference: { startsWith: prefix } } });
          const created = await tx.journalEntry.create({
            data: {
              churchId: user.churchId, reference: `${prefix}${String(count + 1).padStart(6, '0')}`, description: `Cash deposit to bank (${dep.bankReference})`, postDate: dep.depositDate,
              periodId: period?.id ?? null, status: 'POSTED', source: 'DEPOSIT', sourceId: id, createdBy: dep.recordedBy, postedBy: user.id, postedAt: new Date(),
              lines: { createMany: { data: [
                { id: randomUUID(), accountId: bank.id, debit: dep.amount, credit: D(0), memo: dep.bankReference },
                { id: randomUUID(), accountId: cash.id, debit: D(0), credit: dep.amount, memo: dep.bankReference },
              ] } },
            },
          });
          await tx.deposit.update({ where: { id }, data: { journalEntryId: created.id } });
          return created;
        });
        await this.audit(user, 'DEPOSIT_VERIFIED', id, { journalEntryId: entry.id });
        return { id, status: 'VERIFIED', journalEntryId: entry.id, reference: entry.reference };
      } catch (error) {
        const refClash = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && String(error.meta?.target).includes('reference');
        if (!refClash || attempt >= 4) throw error;
      }
    }
  }

  /**
   * Treasurer view. Approved (RECONCILED) and pending (SUBMITTED) collections are kept apart and never summed together;
   * every figure is per currency and computed from stored sessions and deposits, nothing hardcoded.
   */
  async overview(user: AuthorizedUser) {
    require(user, 'finance:view');
    const [sessions, deposits] = await Promise.all([
      prisma.cashSession.findMany({ where: { churchId: user.churchId, status: { in: ['SUBMITTED', 'RECONCILED'] } }, select: { id: true, status: true, snapshotJson: true }, take: 2000 }),
      prisma.deposit.findMany({ where: { churchId: user.churchId, status: { in: ['PENDING', 'VERIFIED'] } }, select: { status: true, currency: true, amount: true }, take: 5000 }),
    ]);
    const approved: Record<string, Prisma.Decimal> = {};
    const pending: Record<string, Prisma.Decimal> = {};
    let approvedSessions = 0;
    let pendingSessions = 0;
    for (const s of sessions) {
      const cashReceipts = parse<Snap>(s.snapshotJson)?.cashReceipts ?? {};
      const target = s.status === 'RECONCILED' ? approved : pending;
      if (s.status === 'RECONCILED') approvedSessions += 1; else pendingSessions += 1;
      for (const [cur, v] of Object.entries(cashReceipts)) add(target, cur, v);
    }
    const verified: Record<string, Prisma.Decimal> = {};
    const awaiting: Record<string, Prisma.Decimal> = {};
    for (const d of deposits) add(d.status === 'VERIFIED' ? verified : awaiting, d.currency, d.amount);
    // Cash that was approved into custody but is not yet banked (verified) nor in transit (pending deposit).
    const undeposited: Record<string, Prisma.Decimal> = {};
    for (const cur of new Set([...Object.keys(approved), ...Object.keys(verified), ...Object.keys(awaiting)])) {
      undeposited[cur] = (approved[cur] ?? D(0)).minus(verified[cur] ?? 0).minus(awaiting[cur] ?? 0);
    }
    return {
      approvedCash: fix(approved), approvedSessions,
      pendingCash: fix(pending), pendingSessions,
      depositsVerified: fix(verified), depositsAwaitingVerification: fix(awaiting),
      undepositedCash: fix(undeposited),
      note: 'Cash receipts only; mobile money and bank receipts are reconciled separately. A negative undeposited figure means deposits exceed approved cash sessions and should be investigated.',
    };
  }

  private async owned(user: AuthorizedUser, id: string) {
    const dep = await prisma.deposit.findUnique({ where: { id } });
    if (!dep || dep.churchId !== user.churchId) throw new NotFoundError('Deposit');
    return dep;
  }
  private noSelf(user: AuthorizedUser, recordedBy: string) {
    if (recordedBy === user.id) throw new ForbiddenError('You recorded this deposit; a different person must verify it');
  }
  private view(d: { id: string; currency: string; amount: Prisma.Decimal; depositDate: Date; bankReference: string; bankName: string | null; notes: string | null; status: string; recordedBy: string; verifiedBy: string | null; verifiedAt: Date | null; rejectReason: string | null; journalEntryId: string | null }) {
    return { id: d.id, currency: d.currency, amount: toNumber(d.amount), depositDate: d.depositDate, bankReference: d.bankReference, bankName: d.bankName, notes: d.notes, status: d.status, recordedBy: d.recordedBy, verifiedBy: d.verifiedBy, verifiedAt: d.verifiedAt, rejectReason: d.rejectReason, journalEntryId: d.journalEntryId };
  }
  private async audit(user: AuthorizedUser, action: string, entityId: string, details: Record<string, unknown>) {
    try {
      await prisma.auditLog.create({ data: { churchId: user.churchId, action, entityType: 'DEPOSIT', entityId, actorId: user.memberId ?? user.id, changes: JSON.stringify(details) } });
    } catch (error) { logger.error({ err: error, action }, 'Failed to write deposit audit log'); }
  }
}

export const depositService = new DepositService();
