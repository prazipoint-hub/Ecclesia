import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { logger } from '@/config/logger';
import { prisma } from '@/database';
import type { AuthorizedUser } from '@/types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/types/errors';
import { accountingRepository as repository, type EntryRecord } from '../repository';
import type {
  CreateAccountInput, CreatePeriodInput, JournalInput, JournalListQuery, OpeningBalanceInput, ReverseInput, UpdateAccountInput,
} from '../types';
import { assetAccountForPayment, DEFAULT_CHART, expenseAccountForCategory, revenueAccountForIncome } from './defaultChart';
import { D, endOfDay, naturalBalance, startOfDay, toNumber } from './money';

export function require(user: AuthorizedUser, permission: string): void {
  if (!user.permissions.includes(permission)) throw new ForbiddenError(`Forbidden: ${permission} permission required`);
}

type LineInput = { accountId: string; debit: number; credit: number; memo?: string; fundId?: string };
const SYNC_BATCH = 500;

export class LedgerService {
  // ================================================================ accounts

  async listAccounts(user: AuthorizedUser) {
    require(user, 'finance:view');
    const [accounts, sums] = await Promise.all([repository.listAccounts(user.churchId), repository.sumsByAccount(user.churchId, {})]);
    const totals = new Map(sums.map((s) => [s.accountId, s._sum]));
    return accounts.map((a) => ({
      id: a.id, code: a.code, name: a.name, type: a.type, description: a.description, parentId: a.parentId, isActive: a.isActive, isSystem: a.isSystem,
      balance: toNumber(naturalBalance(a.type, totals.get(a.id)?.debit ?? 0, totals.get(a.id)?.credit ?? 0)),
    }));
  }

  async createAccount(user: AuthorizedUser, input: CreateAccountInput) {
    require(user, 'finance:coa:manage');
    if (input.parentId) {
      const parent = await repository.findAccount(input.parentId);
      if (!parent || parent.churchId !== user.churchId) throw new ValidationError('Parent account not found');
      if (parent.type !== input.type) throw new ValidationError('A sub-account must have the same type as its parent');
    }
    try {
      const account = await repository.createAccount({ churchId: user.churchId, ...input, description: input.description ?? null, parentId: input.parentId ?? null });
      await this.audit(user, 'LEDGER_ACCOUNT_CREATED', account.id, { code: account.code });
      return account;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictError(`Account code ${input.code} is already in use`);
      throw error;
    }
  }

  async updateAccount(user: AuthorizedUser, id: string, input: UpdateAccountInput) {
    require(user, 'finance:coa:manage');
    const account = await this.ownedAccount(user, id);
    if (input.isActive === false) {
      if (account.isSystem) throw new ConflictError('System accounts cannot be deactivated');
      if (await repository.countChildren(id)) throw new ConflictError('Deactivate the sub-accounts first');
    }
    const updated = await repository.updateAccount(id, input);
    await this.audit(user, 'LEDGER_ACCOUNT_UPDATED', id, input);
    return updated;
  }

  /** Adds any standard accounts the church does not have yet; safe to run repeatedly. */
  async seedDefaultChart(user: AuthorizedUser) {
    require(user, 'finance:coa:manage');
    const existing = new Set((await repository.findAccountsByCodes(user.churchId, DEFAULT_CHART.map((a) => a.code))).map((a) => a.code));
    const missing = DEFAULT_CHART.filter((a) => !existing.has(a.code));
    if (missing.length > 0) {
      await repository.createAccounts(missing.map((a) => ({ id: randomUUID(), churchId: user.churchId, ...a, isSystem: true })));
      await this.audit(user, 'LEDGER_CHART_SEEDED', user.churchId, { added: missing.length });
    }
    return { added: missing.length, existing: existing.size };
  }

  private async ownedAccount(user: AuthorizedUser, id: string) {
    const account = await repository.findAccount(id);
    if (!account || account.churchId !== user.churchId) throw new NotFoundError('Account');
    return account;
  }

  // ================================================================ periods

  async listPeriods(user: AuthorizedUser) {
    require(user, 'finance:view');
    return repository.listPeriods(user.churchId);
  }

  async createPeriod(user: AuthorizedUser, input: CreatePeriodInput) {
    require(user, 'finance:period:manage');
    const start = startOfDay(input.startDate);
    const end = endOfDay(input.endDate);
    if (end <= start) throw new ValidationError('The period must end after it starts');
    if (await repository.findOverlappingPeriod(user.churchId, start, end)) throw new ConflictError('This period overlaps an existing period');
    try {
      const period = await repository.createPeriod({ churchId: user.churchId, name: input.name, startDate: start, endDate: end });
      await this.audit(user, 'FINANCIAL_PERIOD_CREATED', period.id, { name: input.name });
      return period;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictError('A period with that name already exists');
      throw error;
    }
  }

  async closePeriod(user: AuthorizedUser, id: string) {
    require(user, 'finance:period:manage');
    const period = await this.ownedPeriod(user, id);
    if (period.status !== 'OPEN') throw new ConflictError('This period is already closed');
    const drafts = await repository.countDraftsIn(user.churchId, period.startDate, period.endDate);
    if (drafts > 0) throw new ConflictError(`${drafts} draft journal entr${drafts === 1 ? 'y is' : 'ies are'} still dated in this period. Post or delete them first.`);
    if (!(await repository.transitionPeriod(id, 'OPEN', { status: 'CLOSED', closedAt: new Date(), closedBy: user.id }))) throw new ConflictError('This period is already closed');
    await this.audit(user, 'FINANCIAL_PERIOD_CLOSED', id, {});
    return repository.findPeriod(id);
  }

  async reopenPeriod(user: AuthorizedUser, id: string, reason: string) {
    require(user, 'finance:period:manage');
    const period = await this.ownedPeriod(user, id);
    if (period.status !== 'CLOSED') throw new ConflictError('This period is not closed');
    if (!(await repository.transitionPeriod(id, 'CLOSED', { status: 'OPEN', closedAt: null, closedBy: null }))) throw new ConflictError('This period is not closed');
    await this.audit(user, 'FINANCIAL_PERIOD_REOPENED', id, { reason });
    return repository.findPeriod(id);
  }

  private async ownedPeriod(user: AuthorizedUser, id: string) {
    const period = await repository.findPeriod(id);
    if (!period || period.churchId !== user.churchId) throw new NotFoundError('Period');
    return period;
  }

  /** A date inside a closed period is off limits. Dates outside every defined period are allowed. */
  async periodFor(churchId: string, date: Date): Promise<{ periodId: string | null }> {
    const period = await repository.findPeriodCovering(churchId, date);
    if (period?.status === 'CLOSED') throw new ConflictError(`The period "${period.name}" is closed; entries cannot be dated ${date.toISOString().slice(0, 10)}`);
    return { periodId: period?.id ?? null };
  }

  // ================================================================ journals

  async createJournal(user: AuthorizedUser, input: JournalInput) {
    require(user, 'finance:journal:create');
    await this.validateLines(user.churchId, input.lines);
    await this.periodFor(user.churchId, input.postDate);
    const entry = await this.insertEntry(user.churchId, {
      description: input.description, postDate: input.postDate, source: 'MANUAL', createdBy: user.id, status: 'DRAFT',
    }, input.lines);
    await this.audit(user, 'JOURNAL_CREATED', entry.id, { reference: entry.reference });
    return this.entryView(entry);
  }

  async updateJournal(user: AuthorizedUser, id: string, input: JournalInput) {
    require(user, 'finance:journal:create');
    const entry = await this.ownedEntry(user, id);
    if (entry.status !== 'DRAFT') throw new ConflictError('Only draft entries can be edited; reverse a posted entry instead');
    if (entry.createdBy !== user.id) throw new ForbiddenError('Forbidden: only the person who created a draft can change it');
    await this.validateLines(user.churchId, input.lines);
    await this.periodFor(user.churchId, input.postDate);
    const ok = await repository.replaceLines(id, { description: input.description, postDate: input.postDate }, this.lineRows(input.lines));
    if (!ok) throw new ConflictError('This entry is no longer a draft');
    return this.entryView((await repository.findEntry(id))!);
  }

  async deleteJournal(user: AuthorizedUser, id: string) {
    require(user, 'finance:journal:create');
    const entry = await this.ownedEntry(user, id);
    if (entry.status !== 'DRAFT') throw new ConflictError('Only draft entries can be deleted');
    if (entry.createdBy !== user.id) throw new ForbiddenError('Forbidden: only the person who created a draft can delete it');
    if (!(await repository.deleteDraft(id))) throw new ConflictError('This entry is no longer a draft');
    await this.audit(user, 'JOURNAL_DELETED', id, { reference: entry.reference });
  }

  /** Posting makes an entry permanent. A second person must approve what the first prepared. */
  async postJournal(user: AuthorizedUser, id: string) {
    require(user, 'finance:journal:approve');
    const entry = await this.ownedEntry(user, id);
    if (entry.status !== 'DRAFT') throw new ConflictError(`This entry is already ${entry.status.toLowerCase()}`);
    if (entry.createdBy === user.id) throw new ForbiddenError('Forbidden: a different person must approve an entry you prepared');
    const lines = entry.lines.map((l) => ({ accountId: l.accountId, debit: toNumber(l.debit), credit: toNumber(l.credit), fundId: l.fundId ?? undefined }));
    await this.validateLines(user.churchId, lines);
    const { periodId } = await this.periodFor(user.churchId, entry.postDate);
    const claimed = await prisma.journalEntry.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'POSTED', postedBy: user.id, postedAt: new Date(), periodId } });
    if (claimed.count === 0) throw new ConflictError('This entry was already posted');
    await this.audit(user, 'JOURNAL_POSTED', id, { reference: entry.reference });
    return this.entryView((await repository.findEntry(id))!);
  }

  async reverseJournal(user: AuthorizedUser, id: string, input: ReverseInput) {
    require(user, 'finance:journal:reverse');
    const entry = await this.ownedEntry(user, id);
    const reversal = await this.createReversal(user.churchId, entry, input.reason, input.postDate ?? new Date(), user.id);
    await this.audit(user, 'JOURNAL_REVERSED', id, { reversalId: reversal.id, reason: input.reason });
    return this.entryView(reversal);
  }

  private async createReversal(churchId: string, entry: EntryRecord, reason: string, postDate: Date, actorId: string): Promise<EntryRecord> {
    if (entry.status !== 'POSTED') throw new ConflictError(`Only posted entries can be reversed; this one is ${entry.status.toLowerCase()}`);
    if (entry.source === 'REVERSAL') throw new ConflictError('A reversal cannot itself be reversed; post a new entry instead');
    const { periodId } = await this.periodFor(churchId, postDate);
    const swapped: LineInput[] = entry.lines.map((l) => ({ accountId: l.accountId, debit: toNumber(l.credit), credit: toNumber(l.debit), memo: l.memo ?? undefined, fundId: l.fundId ?? undefined }));
    try {
      return await prisma.$transaction(async (tx) => {
        const claimed = await tx.journalEntry.updateMany({ where: { id: entry.id, status: 'POSTED' }, data: { status: 'REVERSED' } });
        if (claimed.count === 0) throw new ConflictError('This entry was already reversed');
        const reference = await this.nextReference(churchId, tx);
        return tx.journalEntry.create({
          data: {
            churchId, reference, description: `Reversal of ${entry.reference}: ${reason}`, postDate, periodId, status: 'POSTED', source: 'REVERSAL',
            reversesEntryId: entry.id, reversalReason: reason, createdBy: actorId, postedBy: actorId, postedAt: new Date(),
            lines: { createMany: { data: this.lineRows(swapped) } },
          },
          include: { lines: { include: { account: { select: { code: true, name: true, type: true } } }, orderBy: { id: 'asc' } } },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && String(error.meta?.target).includes('reversesEntryId')) {
        throw new ConflictError('This entry was already reversed');
      }
      throw error;
    }
  }

  async getJournal(user: AuthorizedUser, id: string) {
    require(user, 'finance:view');
    return this.entryView(await this.ownedEntry(user, id));
  }

  async listJournals(user: AuthorizedUser, query: JournalListQuery) {
    require(user, 'finance:view');
    const where: Prisma.JournalEntryWhereInput = {
      churchId: user.churchId,
      ...(query.status && { status: query.status }),
      ...(query.source && { source: query.source }),
      ...(query.accountId && { lines: { some: { accountId: query.accountId } } }),
      ...((query.from || query.to) && { postDate: { ...(query.from && { gte: startOfDay(query.from) }), ...(query.to && { lte: endOfDay(query.to) }) } }),
      ...(query.q && { OR: [{ reference: { contains: query.q } }, { description: { contains: query.q } }] }),
    };
    const [rows, total] = await repository.listEntries(where, (query.page - 1) * query.pageSize, query.pageSize);
    return {
      items: rows.map((e) => ({
        id: e.id, reference: e.reference, description: e.description, postDate: e.postDate, status: e.status, source: e.source,
        total: toNumber(e.lines.reduce((sum, l) => sum.plus(l.debit), D(0))),
      })),
      total, page: query.page, pageSize: query.pageSize,
    };
  }

  private async validateLines(churchId: string, lines: LineInput[]) {
    const accountIds = [...new Set(lines.map((l) => l.accountId))];
    const accounts = await repository.findAccountsByIds(churchId, accountIds);
    if (accounts.length !== accountIds.length) throw new ValidationError('One or more accounts do not exist');
    const inactive = accounts.find((a) => !a.isActive);
    if (inactive) throw new ValidationError(`Account ${inactive.code} ${inactive.name} is inactive`);
    const fundIds = [...new Set(lines.map((l) => l.fundId).filter((f): f is string => !!f))];
    if (fundIds.length && (await repository.findFundsInChurch(churchId, fundIds)).length !== fundIds.length) throw new ValidationError('One or more funds do not exist');

    const debits = lines.reduce((sum, l) => sum.plus(l.debit), D(0));
    const credits = lines.reduce((sum, l) => sum.plus(l.credit), D(0));
    if (!debits.equals(credits)) throw new ValidationError(`The entry does not balance: debits ${debits.toFixed(2)}, credits ${credits.toFixed(2)}`);
    if (debits.lte(0)) throw new ValidationError('The entry must have a value');
  }

  private lineRows(lines: LineInput[]): Prisma.JournalLineCreateManyEntryInput[] {
    return lines.map((l) => ({ id: randomUUID(), accountId: l.accountId, debit: D(l.debit), credit: D(l.credit), memo: l.memo ?? null, fundId: l.fundId ?? null }));
  }

  private async nextReference(churchId: string, tx?: Prisma.TransactionClient): Promise<string> {
    const prefix = `JE-${new Date().getUTCFullYear()}-`;
    const count = tx ? await tx.journalEntry.count({ where: { churchId, reference: { startsWith: prefix } } }) : await repository.countEntriesForYear(churchId, prefix);
    return `${prefix}${String(count + 1).padStart(6, '0')}`;
  }

  /** Reference numbers are count-based, so a concurrent insert can collide; the unique index catches it and we retry. */
  private async insertEntry(
    churchId: string,
    data: { description: string; postDate: Date; source: string; sourceId?: string; createdBy: string; status: string; postedBy?: string; postedAt?: Date; periodId?: string | null },
    lines: LineInput[]
  ): Promise<EntryRecord> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await repository.createEntry(
          { churchId, reference: await this.nextReference(churchId), sourceId: data.sourceId ?? null, ...data },
          this.lineRows(lines)
        );
      } catch (error) {
        const collision = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && String(error.meta?.target).includes('reference');
        if (!collision || attempt >= 4) throw error;
      }
    }
  }

  private async ownedEntry(user: AuthorizedUser, id: string): Promise<EntryRecord> {
    const entry = await repository.findEntry(id);
    if (!entry || entry.churchId !== user.churchId) throw new NotFoundError('Journal entry');
    return entry;
  }

  private entryView(e: EntryRecord) {
    return {
      id: e.id, reference: e.reference, description: e.description, postDate: e.postDate, status: e.status, source: e.source, sourceId: e.sourceId,
      reversesEntryId: e.reversesEntryId, reversalReason: e.reversalReason, createdBy: e.createdBy, postedBy: e.postedBy, postedAt: e.postedAt,
      lines: e.lines.map((l) => ({ id: l.id, accountId: l.accountId, accountCode: l.account.code, accountName: l.account.name, debit: toNumber(l.debit), credit: toNumber(l.credit), memo: l.memo, fundId: l.fundId })),
    };
  }

  // ======================================================= opening balances

  async setOpeningBalances(user: AuthorizedUser, input: OpeningBalanceInput) {
    require(user, 'finance:opening:set');
    const accounts = await repository.findAccountsByIds(user.churchId, input.balances.map((b) => b.accountId));
    if (accounts.length !== new Set(input.balances.map((b) => b.accountId)).size) throw new ValidationError('One or more accounts do not exist');
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const equity = (await repository.findAccountsByCodes(user.churchId, ['3100']))[0];
    if (!equity) throw new ValidationError('Add the default chart of accounts first (account 3100 Opening Balance Equity is missing)');

    const lines: LineInput[] = [];
    let debits = D(0);
    let credits = D(0);
    for (const b of input.balances) {
      const account = byId.get(b.accountId)!;
      if (!['ASSET', 'LIABILITY', 'EQUITY'].includes(account.type)) throw new ValidationError(`${account.code} ${account.name} is not a balance sheet account`);
      if (account.id === equity.id) throw new ValidationError('Opening Balance Equity is calculated for you; do not enter it');
      const debit = account.type === 'ASSET';
      lines.push({ accountId: account.id, debit: debit ? b.amount : 0, credit: debit ? 0 : b.amount, memo: 'Opening balance' });
      if (debit) debits = debits.plus(b.amount); else credits = credits.plus(b.amount);
    }
    const difference = debits.minus(credits);
    if (!difference.isZero()) lines.push({ accountId: equity.id, debit: difference.isNegative() ? Number(difference.abs()) : 0, credit: difference.isPositive() ? Number(difference) : 0, memo: 'Opening balance equity' });

    const { periodId } = await this.periodFor(user.churchId, input.asOf);
    try {
      const entry = await this.insertEntry(user.churchId, {
        description: 'Opening balances', postDate: startOfDay(input.asOf), source: 'OPENING', sourceId: 'opening', createdBy: user.id, status: 'POSTED', postedBy: user.id, postedAt: new Date(), periodId,
      }, lines);
      await this.audit(user, 'OPENING_BALANCES_SET', entry.id, { lines: lines.length });
      return this.entryView(entry);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('Opening balances were already set. Reverse that entry first to enter them again.');
      }
      throw error;
    }
  }

  // ===================================================== receipt/expenditure sync

  /**
   * Turns receipts and paid expenditures into posted journal entries, once each. Idempotent: the unique
   * (church, source, sourceId) index means re-running never double counts. Voided receipts are reversed.
   */
  async syncSubledgers(user: AuthorizedUser, preview: boolean) {
    require(user, 'finance:journal:approve');
    const codes = await repository.findAccountsByCodes(user.churchId, ['1000', '1100', '1200', '4000', '4100', '4200', '4300', '4900', '5000', '5100', '5200', '5300', '5400', '5900']);
    const byCode = new Map(codes.map((a) => [a.code, a]));
    if (!byCode.has('1000') || !byCode.has('1100') || !byCode.has('4000') || !byCode.has('5900')) {
      throw new ValidationError('Add the default chart of accounts before syncing receipts and expenditures');
    }
    const account = (code: string) => (byCode.get(code) ?? byCode.get(code[0] === '4' ? '4900' : code[0] === '5' ? '5900' : '1100'))!;

    const result = { receipts: 0, expenditures: 0, reversed: 0, blockedByClosedPeriod: 0, failed: 0, total: D(0), remaining: false };
    let budget = SYNC_BATCH;

    // receipts (issued -> post; voided and previously posted -> reverse)
    let cursor: string | null = null;
    while (budget > 0) {
      const batch = await repository.receiptsAfter(user.churchId, cursor, 200);
      if (batch.length === 0) break;
      cursor = batch[batch.length - 1].id;
      const entries = new Map((await repository.findEntriesBySource(user.churchId, 'RECEIPT', batch.map((r) => r.id))).map((e) => [e.sourceId, e]));
      for (const receipt of batch) {
        const existing = entries.get(receipt.id);
        if (budget <= 0) { result.remaining = true; break; }
        try {
          if (receipt.status === 'ISSUED' && !existing) {
            budget -= 1;
            if (preview) { result.receipts += 1; result.total = result.total.plus(receipt.amount); continue; }
            const { periodId } = await this.periodFor(user.churchId, receipt.issuedAt);
            await this.insertEntry(user.churchId, {
              description: `Receipt ${receipt.receiptNumber}`, postDate: receipt.issuedAt, source: 'RECEIPT', sourceId: receipt.id, createdBy: user.id, status: 'POSTED', postedBy: user.id, postedAt: new Date(), periodId,
            }, [
              { accountId: account(assetAccountForPayment(receipt.paymentMethod)).id, debit: toNumber(receipt.amount), credit: 0, fundId: receipt.fundId },
              { accountId: account(revenueAccountForIncome(receipt.incomeType)).id, debit: 0, credit: toNumber(receipt.amount), fundId: receipt.fundId },
            ]);
            result.receipts += 1;
            result.total = result.total.plus(receipt.amount);
          } else if (receipt.status === 'VOIDED' && existing?.status === 'POSTED') {
            budget -= 1;
            if (preview) { result.reversed += 1; continue; }
            const entry = (await repository.findEntry(existing.id))!;
            await this.createReversal(user.churchId, entry, `Receipt ${receipt.receiptNumber} was voided`, new Date(), user.id);
            result.reversed += 1;
          }
        } catch (error) {
          this.countSyncFailure(result, error, receipt.id);
        }
      }
      if (batch.length < 200) break;
    }

    // paid expenditures
    cursor = null;
    while (budget > 0) {
      const batch = await repository.paidExpendituresAfter(user.churchId, cursor, 200);
      if (batch.length === 0) break;
      cursor = batch[batch.length - 1].id;
      const posted = new Set((await repository.findEntriesBySource(user.churchId, 'EXPENDITURE', batch.map((e) => e.id))).map((e) => e.sourceId));
      for (const exp of batch) {
        if (posted.has(exp.id)) continue;
        if (budget <= 0) { result.remaining = true; break; }
        budget -= 1;
        try {
          if (preview) { result.expenditures += 1; result.total = result.total.plus(exp.amount); continue; }
          const date = exp.paidAt!;
          const { periodId } = await this.periodFor(user.churchId, date);
          await this.insertEntry(user.churchId, {
            description: `Expenditure: ${exp.purpose}`.slice(0, 300), postDate: date, source: 'EXPENDITURE', sourceId: exp.id, createdBy: user.id, status: 'POSTED', postedBy: user.id, postedAt: new Date(), periodId,
          }, [
            { accountId: account(expenseAccountForCategory(exp.category)).id, debit: toNumber(exp.amount), credit: 0, fundId: exp.fundId },
            { accountId: account('1100').id, debit: 0, credit: toNumber(exp.amount), fundId: exp.fundId, memo: 'Paid from bank; adjust with a journal if paid in cash' },
          ]);
          result.expenditures += 1;
          result.total = result.total.plus(exp.amount);
        } catch (error) {
          this.countSyncFailure(result, error, exp.id);
        }
      }
      if (batch.length < 200) break;
    }

    if (!preview && (result.receipts || result.expenditures || result.reversed)) {
      await this.audit(user, 'LEDGER_SYNCED', user.churchId, { receipts: result.receipts, expenditures: result.expenditures, reversed: result.reversed });
    }
    return { preview, receipts: result.receipts, expenditures: result.expenditures, reversed: result.reversed, blockedByClosedPeriod: result.blockedByClosedPeriod, failed: result.failed, total: toNumber(result.total), remaining: result.remaining };
  }

  private countSyncFailure(result: { blockedByClosedPeriod: number; failed: number }, error: unknown, sourceId: string) {
    if (error instanceof ConflictError && /closed/.test(error.message)) result.blockedByClosedPeriod += 1;
    else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return; // another run got there first
    else { result.failed += 1; logger.error({ err: error, sourceId }, 'Ledger sync failed for one item'); }
  }

  // =================================================================== reports

  private async sums(churchId: string, range: { from?: Date; to?: Date }) {
    const [accounts, sums] = await Promise.all([repository.listAccounts(churchId), repository.sumsByAccount(churchId, range)]);
    const totals = new Map(sums.map((s) => [s.accountId, s._sum]));
    return accounts.map((a) => {
      const debit = D(totals.get(a.id)?.debit ?? 0);
      const credit = D(totals.get(a.id)?.credit ?? 0);
      return { account: a, debit, credit, balance: naturalBalance(a.type, debit, credit) };
    });
  }

  async trialBalance(user: AuthorizedUser, asOf?: Date) {
    require(user, 'finance:view');
    const rows = (await this.sums(user.churchId, { to: asOf ? endOfDay(asOf) : undefined }))
      .filter((r) => !r.debit.isZero() || !r.credit.isZero())
      .map((r) => {
        const net = r.debit.minus(r.credit);
        return { account: r.account, debit: net.isPositive() ? net : D(0), credit: net.isNegative() ? net.abs() : D(0) };
      });
    const debit = rows.reduce((s, r) => s.plus(r.debit), D(0));
    const credit = rows.reduce((s, r) => s.plus(r.credit), D(0));
    return {
      asOf: asOf ?? null,
      rows: rows.map((r) => ({ accountId: r.account.id, code: r.account.code, name: r.account.name, type: r.account.type, debit: toNumber(r.debit), credit: toNumber(r.credit) })),
      totalDebit: toNumber(debit),
      totalCredit: toNumber(credit),
      balanced: debit.equals(credit),
    };
  }

  async incomeStatement(user: AuthorizedUser, from?: Date, to?: Date) {
    require(user, 'finance:view');
    const rows = await this.sums(user.churchId, { from: from ? startOfDay(from) : undefined, to: to ? endOfDay(to) : undefined });
    const section = (type: string) => rows.filter((r) => r.account.type === type && !r.balance.isZero()).map((r) => ({ accountId: r.account.id, code: r.account.code, name: r.account.name, amount: toNumber(r.balance) }));
    const sum = (type: string) => rows.filter((r) => r.account.type === type).reduce((s, r) => s.plus(r.balance), D(0));
    return { from: from ?? null, to: to ?? null, revenue: section('REVENUE'), expenses: section('EXPENSE'), totalRevenue: toNumber(sum('REVENUE')), totalExpenses: toNumber(sum('EXPENSE')), netSurplus: toNumber(sum('REVENUE').minus(sum('EXPENSE'))) };
  }

  async balanceSheet(user: AuthorizedUser, asOf?: Date) {
    require(user, 'finance:view');
    const rows = await this.sums(user.churchId, { to: asOf ? endOfDay(asOf) : undefined });
    const section = (type: string) => rows.filter((r) => r.account.type === type && !r.balance.isZero()).map((r) => ({ accountId: r.account.id, code: r.account.code, name: r.account.name, amount: toNumber(r.balance) }));
    const total = (type: string) => rows.filter((r) => r.account.type === type).reduce((s, r) => s.plus(r.balance), D(0));
    // Surplus not yet closed into equity still belongs on the equity side.
    const surplus = total('REVENUE').minus(total('EXPENSE'));
    const assets = total('ASSET');
    const liabilitiesAndEquity = total('LIABILITY').plus(total('EQUITY')).plus(surplus);
    return {
      asOf: asOf ?? null, assets: section('ASSET'), liabilities: section('LIABILITY'), equity: section('EQUITY'), currentSurplus: toNumber(surplus),
      totalAssets: toNumber(assets), totalLiabilities: toNumber(total('LIABILITY')), totalEquity: toNumber(total('EQUITY').plus(surplus)), balanced: assets.equals(liabilitiesAndEquity),
    };
  }

  async accountLedger(user: AuthorizedUser, accountId: string, from?: Date, to?: Date) {
    require(user, 'finance:view');
    const account = await this.ownedAccount(user, accountId);
    const start = from ? startOfDay(from) : undefined;
    const before = start ? await repository.balanceBefore(accountId, user.churchId, start) : { debit: null, credit: null };
    let running = naturalBalance(account.type, before.debit ?? 0, before.credit ?? 0);
    const opening = running;
    const lines = await repository.accountLines(accountId, user.churchId, { from: start, to: to ? endOfDay(to) : undefined }, 1001);
    const items = lines.slice(0, 1000).map((l) => {
      running = running.plus(naturalBalance(account.type, l.debit, l.credit));
      return { entryId: l.entry.id, reference: l.entry.reference, description: l.entry.description, memo: l.memo, postDate: l.entry.postDate, entryStatus: l.entry.status, debit: toNumber(l.debit), credit: toNumber(l.credit), balance: toNumber(running) };
    });
    return { account: { id: account.id, code: account.code, name: account.name, type: account.type }, openingBalance: toNumber(opening), items, truncated: lines.length > 1000, closingBalance: toNumber(running) };
  }

  private async audit(user: AuthorizedUser, action: string, entityId: string, details: Record<string, unknown>) {
    try {
      await prisma.auditLog.create({ data: { churchId: user.churchId, action, entityType: 'ACCOUNTING', entityId, actorId: user.memberId ?? user.id, changes: JSON.stringify(details) } });
    } catch (error) {
      logger.error({ err: error, action }, 'Failed to write accounting audit log');
    }
  }
}

export const ledgerService = new LedgerService();
