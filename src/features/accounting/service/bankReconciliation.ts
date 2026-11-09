import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { logger } from '@/config/logger';
import { prisma } from '@/database';
import type { AuthorizedUser } from '@/types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/types/errors';
import { require } from './ledger';
import { D } from './money';

/**
 * Bank reconciliation for the Bank ledger account (1100). A statement is imported line by line, each line is matched to ONE
 * posted journal line of exactly the same amount, and the reconciliation can be completed only when
 *   (statement closing + book items not yet on the statement) - (book balance + statement items not yet in the books) = 0,
 * by a person other than the one who started it. A cashier's cash count or a verified deposit is not a reconciliation.
 * The ledger has no per-currency balances, so `currency` labels the statement; it does not convert anything.
 */
const money = z.number().finite().min(-1e12).max(1e12);
export const CreateReconciliationSchema = z.object({
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  periodStart: z.coerce.date(), periodEnd: z.coerce.date(),
  statementOpening: money, statementClosing: money, notes: z.string().trim().max(1000).optional(),
}).strict();
export const ImportLinesSchema = z.object({
  lines: z.array(z.object({
    date: z.coerce.date(), description: z.string().trim().min(1).max(190), reference: z.string().trim().max(190).optional(), amount: money.refine((n) => n !== 0, 'Amount cannot be zero'),
  }).strict()).min(1).max(500),
}).strict();
export const MatchSchema = z.object({ lineId: z.string().trim().min(1).max(64), journalLineId: z.string().trim().min(1).max(64) }).strict();
const DAY = 86_400_000;
const WINDOW_DAYS = 5;
const POSTED_STATES = ['POSTED', 'REVERSED'];
const view = <T extends { amount: Prisma.Decimal }>(l: T) => ({ ...l, amount: l.amount.toFixed(2) });

export class BankReconciliationService {
  async create(user: AuthorizedUser, raw: unknown) {
    require(user, 'finance:reconcile:manage');
    const input = CreateReconciliationSchema.parse(raw);
    if (input.periodStart > input.periodEnd) throw new ValidationError('The statement start must be before its end');
    const row = await prisma.bankReconciliation.create({ data: { churchId: user.churchId, currency: input.currency, periodStart: input.periodStart, periodEnd: input.periodEnd, statementOpening: D(input.statementOpening), statementClosing: D(input.statementClosing), notes: input.notes ?? null, createdBy: user.id } });
    await this.audit(user, 'BANK_RECONCILIATION_STARTED', row.id, { currency: row.currency });
    return this.head(row);
  }

  async list(user: AuthorizedUser) {
    require(user, 'finance:view');
    const rows = await prisma.bankReconciliation.findMany({ where: { churchId: user.churchId }, orderBy: { periodEnd: 'desc' }, take: 100 });
    return rows.map((r) => this.head(r));
  }

  /** Statement lines are de-duplicated by content, so uploading the same file twice adds nothing. */
  async importLines(user: AuthorizedUser, id: string, raw: unknown) {
    require(user, 'finance:reconcile:manage');
    const { lines } = ImportLinesSchema.parse(raw);
    const rec = await this.draft(user, id);
    const seen = new Map<string, number>();
    const data = lines.map((l) => {
      const base = [l.date.toISOString().slice(0, 10), D(l.amount).toFixed(2), l.reference ?? '', l.description].join('|');
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      return { reconciliationId: rec.id, churchId: user.churchId, lineDate: l.date, description: l.description, reference: l.reference ?? null, amount: D(l.amount), lineHash: createHash('sha256').update(`${base}|${n}`).digest('hex') };
    });
    const res = await prisma.bankStatementLine.createMany({ data, skipDuplicates: true });
    await this.audit(user, 'BANK_STATEMENT_IMPORTED', id, { submitted: data.length, added: res.count, duplicates: data.length - res.count });
    return { submitted: data.length, added: res.count, duplicatesSkipped: data.length - res.count };
  }

  async match(user: AuthorizedUser, id: string, raw: unknown) {
    require(user, 'finance:reconcile:manage');
    const { lineId, journalLineId } = MatchSchema.parse(raw);
    const rec = await this.draft(user, id);
    const line = await prisma.bankStatementLine.findFirst({ where: { id: lineId, reconciliationId: rec.id, churchId: user.churchId } });
    if (!line) throw new NotFoundError('Statement line');
    const book = await this.bookLine(user.churchId, journalLineId);
    if (!book) throw new NotFoundError('Ledger line');
    if (!bookAmount(book).equals(line.amount)) throw new ConflictError(`Amounts differ: statement ${line.amount.toFixed(2)}, ledger ${bookAmount(book).toFixed(2)}. Only identical amounts can be matched.`);
    return this.claim(user, rec.id, line.id, journalLineId);
  }

  async unmatch(user: AuthorizedUser, id: string, lineId: string) {
    require(user, 'finance:reconcile:manage');
    const rec = await this.draft(user, id);
    const res = await prisma.bankStatementLine.updateMany({ where: { id: lineId, reconciliationId: rec.id, status: 'MATCHED' }, data: { status: 'UNMATCHED', matchedJournalLineId: null, matchedBy: null, matchedAt: null } });
    if (res.count === 0) throw new ConflictError('That line is not matched');
    await this.audit(user, 'BANK_LINE_UNMATCHED', id, { lineId });
    return { lineId, status: 'UNMATCHED' };
  }

  /** Matches only where exactly one statement line and exactly one ledger line share an amount inside the date window. */
  async autoMatch(user: AuthorizedUser, id: string) {
    require(user, 'finance:reconcile:manage');
    const rec = await this.draft(user, id);
    const { statement, book } = await this.open(user.churchId, rec);
    let matched = 0;
    for (const s of statement) {
      const near = (b: (typeof book)[number]) => bookAmount(b).equals(s.amount) && Math.abs(b.entry.postDate.getTime() - s.lineDate.getTime()) <= WINDOW_DAYS * DAY;
      const cands = book.filter(near);
      const rivals = statement.filter((o) => o.id !== s.id && cands.some((b) => bookAmount(b).equals(o.amount) && Math.abs(b.entry.postDate.getTime() - o.lineDate.getTime()) <= WINDOW_DAYS * DAY));
      if (cands.length === 1 && rivals.length === 0) {
        try { await this.claim(user, rec.id, s.id, cands[0].id, true); matched += 1; } catch { /* lost a race; leave it for a person */ }
      }
    }
    await this.audit(user, 'BANK_AUTO_MATCH', id, { matched });
    return { matched };
  }

  async detail(user: AuthorizedUser, id: string) {
    require(user, 'finance:view');
    const rec = await this.owned(user, id);
    if (rec.status === 'COMPLETED' && rec.summaryJson) return { ...this.head(rec), summary: JSON.parse(rec.summaryJson) };
    const { statement, book, bookBalance } = await this.open(user.churchId, rec);
    const all = await prisma.bankStatementLine.findMany({ where: { reconciliationId: rec.id }, orderBy: { lineDate: 'asc' } });
    return {
      ...this.head(rec), summary: this.sum(rec, bookBalance, statement, book),
      statementLines: all.map(view),
      unmatchedBook: book.map((b) => ({ journalLineId: b.id, date: b.entry.postDate, reference: b.entry.reference, description: b.entry.description, amount: bookAmount(b).toFixed(2) })),
    };
  }

  async complete(user: AuthorizedUser, id: string) {
    require(user, 'finance:reconcile:complete');
    const rec = await this.draft(user, id);
    if (rec.createdBy === user.id) throw new ForbiddenError('A different person must complete a reconciliation you started');
    const out = await prisma.$transaction(async (tx) => {
      const { statement, book, bookBalance } = await this.open(user.churchId, rec, tx);
      const summary = this.sum(rec, bookBalance, statement, book);
      if (summary.difference !== '0.00') throw new ConflictError(`The reconciliation does not balance: difference ${summary.difference}`);
      const claimed = await tx.bankReconciliation.updateMany({ where: { id, churchId: user.churchId, status: 'DRAFT' }, data: { status: 'COMPLETED', completedBy: user.id, completedAt: new Date(), summaryJson: JSON.stringify(summary) } });
      if (claimed.count === 0) throw new ConflictError('This reconciliation was already completed');
      return summary;
    });
    await this.audit(user, 'BANK_RECONCILIATION_COMPLETED', id, { difference: out.difference });
    return { id, status: 'COMPLETED', summary: out };
  }

  // ------------------------------------------------------------ internals

  private async claim(user: AuthorizedUser, recId: string, lineId: string, journalLineId: string, auto = false) {
    try {
      const res = await prisma.bankStatementLine.updateMany({ where: { id: lineId, reconciliationId: recId, status: 'UNMATCHED' }, data: { status: 'MATCHED', matchedJournalLineId: journalLineId, matchedBy: user.id, matchedAt: new Date() } });
      if (res.count === 0) throw new ConflictError('That statement line is already matched');
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictError('That ledger line is already matched to a statement line');
      throw error;
    }
    if (!auto) await this.audit(user, 'BANK_LINE_MATCHED', recId, { lineId, journalLineId });
    return { lineId, journalLineId, status: 'MATCHED' };
  }

  private async bankAccountId(churchId: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
    const acc = await db.ledgerAccount.findFirst({ where: { churchId, code: '1100' }, select: { id: true } });
    if (!acc) throw new ValidationError('Add the default chart of accounts (1100 Bank) before reconciling');
    return acc.id;
  }

  private async bookLine(churchId: string, journalLineId: string) {
    const accountId = await this.bankAccountId(churchId);
    return prisma.journalLine.findFirst({ where: { id: journalLineId, accountId, entry: { churchId, status: { in: POSTED_STATES } } }, include: { entry: { select: { postDate: true, reference: true, description: true } } } });
  }

  /** Statement lines not yet matched, ledger Bank lines up to the statement end that no statement line claims, and the ledger balance at that date. */
  private async open(churchId: string, rec: { id: string; periodEnd: Date }, db: Prisma.TransactionClient | typeof prisma = prisma) {
    const accountId = await this.bankAccountId(churchId, db);
    const where = { accountId, entry: { churchId, status: { in: POSTED_STATES }, postDate: { lte: rec.periodEnd } } };
    const [statement, lines, claimed] = await Promise.all([
      db.bankStatementLine.findMany({ where: { reconciliationId: rec.id, status: 'UNMATCHED' }, orderBy: { lineDate: 'asc' } }),
      db.journalLine.findMany({ where, include: { entry: { select: { postDate: true, reference: true, description: true } } }, take: 20000 }),
      db.bankStatementLine.findMany({ where: { churchId, matchedJournalLineId: { not: null } }, select: { matchedJournalLineId: true } }),
    ]);
    const taken = new Set(claimed.map((c) => c.matchedJournalLineId));
    const bookBalance = lines.reduce((a, l) => a.plus(bookAmount(l)), D(0));
    return { statement, book: lines.filter((l) => !taken.has(l.id)), bookBalance };
  }

  private sum(rec: { statementOpening: Prisma.Decimal; statementClosing: Prisma.Decimal }, bookBalance: Prisma.Decimal, statement: Array<{ amount: Prisma.Decimal }>, book: Parameters<typeof bookAmount>[0][]) {
    const stmtOnly = statement.reduce((a, s) => a.plus(s.amount), D(0)); // on the statement, not in the books
    const bookOnly = book.reduce((a, b) => a.plus(bookAmount(b)), D(0)); // in the books, not on the statement
    const adjustedBank = rec.statementClosing.plus(bookOnly);
    const adjustedBook = bookBalance.plus(stmtOnly);
    return {
      statementClosing: rec.statementClosing.toFixed(2), ledgerBalance: bookBalance.toFixed(2),
      unmatchedStatementCount: statement.length, unmatchedStatementNet: stmtOnly.toFixed(2),
      unmatchedLedgerCount: book.length, unmatchedLedgerNet: bookOnly.toFixed(2),
      adjustedBank: adjustedBank.toFixed(2), adjustedBook: adjustedBook.toFixed(2), difference: adjustedBank.minus(adjustedBook).toFixed(2),
    };
  }

  private head(r: { id: string; currency: string; periodStart: Date; periodEnd: Date; statementOpening: Prisma.Decimal; statementClosing: Prisma.Decimal; status: string; createdBy: string; completedBy: string | null; completedAt: Date | null; notes: string | null }) {
    return { id: r.id, currency: r.currency, periodStart: r.periodStart, periodEnd: r.periodEnd, statementOpening: r.statementOpening.toFixed(2), statementClosing: r.statementClosing.toFixed(2), status: r.status, createdBy: r.createdBy, completedBy: r.completedBy, completedAt: r.completedAt, notes: r.notes };
  }

  private async owned(user: AuthorizedUser, id: string) {
    const rec = await prisma.bankReconciliation.findUnique({ where: { id } });
    if (!rec || rec.churchId !== user.churchId) throw new NotFoundError('Reconciliation');
    return rec;
  }

  private async draft(user: AuthorizedUser, id: string) {
    const rec = await this.owned(user, id);
    if (rec.status !== 'DRAFT') throw new ConflictError('This reconciliation is completed and can no longer be changed');
    return rec;
  }

  private async audit(user: AuthorizedUser, action: string, entityId: string, details: Record<string, unknown>) {
    try {
      await prisma.auditLog.create({ data: { churchId: user.churchId, action, entityType: 'BANK_RECONCILIATION', entityId, actorId: user.memberId ?? user.id, changes: JSON.stringify(details) } });
    } catch (error) { logger.error({ err: error, action }, 'Failed to write reconciliation audit log'); }
  }
}

/** Debit increases the Bank balance, credit decreases it. */
const bookAmount = (l: { debit: Prisma.Decimal; credit: Prisma.Decimal }) => l.debit.minus(l.credit);

export const bankReconciliationService = new BankReconciliationService();
