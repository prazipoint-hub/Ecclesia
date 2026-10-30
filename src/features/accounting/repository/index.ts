import { Prisma } from '@prisma/client';
import { prisma } from '@/database';

const entryInclude = { lines: { include: { account: { select: { code: true, name: true, type: true } } }, orderBy: { id: 'asc' } } } satisfies Prisma.JournalEntryInclude;
export type EntryRecord = Prisma.JournalEntryGetPayload<{ include: typeof entryInclude }>;

const POSTED_STATES = ['POSTED', 'REVERSED']; // a reversed entry still counts; its reversal cancels it out

export class AccountingRepository {
  // ---- accounts
  listAccounts(churchId: string) {
    return prisma.ledgerAccount.findMany({ where: { churchId }, orderBy: { code: 'asc' } });
  }
  findAccount(id: string) {
    return prisma.ledgerAccount.findUnique({ where: { id } });
  }
  findAccountsByIds(churchId: string, ids: string[]) {
    return prisma.ledgerAccount.findMany({ where: { churchId, id: { in: ids } } });
  }
  findAccountsByCodes(churchId: string, codes: string[]) {
    return prisma.ledgerAccount.findMany({ where: { churchId, code: { in: codes } } });
  }
  createAccount(data: Prisma.LedgerAccountUncheckedCreateInput) {
    return prisma.ledgerAccount.create({ data });
  }
  createAccounts(data: Prisma.LedgerAccountCreateManyInput[]) {
    return prisma.ledgerAccount.createMany({ data });
  }
  updateAccount(id: string, data: Prisma.LedgerAccountUncheckedUpdateInput) {
    return prisma.ledgerAccount.update({ where: { id }, data });
  }
  countAccountActivity(accountId: string) {
    return prisma.journalLine.count({ where: { accountId } });
  }
  countChildren(accountId: string) {
    return prisma.ledgerAccount.count({ where: { parentId: accountId, isActive: true } });
  }

  // ---- periods
  listPeriods(churchId: string) {
    return prisma.financialPeriod.findMany({ where: { churchId }, orderBy: { startDate: 'desc' } });
  }
  findPeriod(id: string) {
    return prisma.financialPeriod.findUnique({ where: { id } });
  }
  findPeriodCovering(churchId: string, date: Date) {
    return prisma.financialPeriod.findFirst({ where: { churchId, startDate: { lte: date }, endDate: { gte: date } } });
  }
  findOverlappingPeriod(churchId: string, start: Date, end: Date) {
    return prisma.financialPeriod.findFirst({ where: { churchId, startDate: { lte: end }, endDate: { gte: start } } });
  }
  createPeriod(data: Prisma.FinancialPeriodUncheckedCreateInput) {
    return prisma.financialPeriod.create({ data });
  }
  async transitionPeriod(id: string, from: string, data: Prisma.FinancialPeriodUncheckedUpdateInput): Promise<boolean> {
    return (await prisma.financialPeriod.updateMany({ where: { id, status: from }, data })).count === 1;
  }
  countDraftsIn(churchId: string, start: Date, end: Date) {
    return prisma.journalEntry.count({ where: { churchId, status: 'DRAFT', postDate: { gte: start, lte: end } } });
  }

  // ---- journals
  findEntry(id: string) {
    return prisma.journalEntry.findUnique({ where: { id }, include: entryInclude });
  }
  async listEntries(where: Prisma.JournalEntryWhereInput, skip: number, take: number) {
    return Promise.all([
      prisma.journalEntry.findMany({ where, skip, take, orderBy: [{ postDate: 'desc' }, { reference: 'desc' }], include: { lines: { select: { debit: true, credit: true } } } }),
      prisma.journalEntry.count({ where }),
    ]);
  }
  countEntriesForYear(churchId: string, prefix: string) {
    return prisma.journalEntry.count({ where: { churchId, reference: { startsWith: prefix } } });
  }
  createEntry(data: Prisma.JournalEntryUncheckedCreateInput, lines: Prisma.JournalLineCreateManyEntryInput[]) {
    return prisma.journalEntry.create({ data: { ...data, lines: { createMany: { data: lines } } }, include: entryInclude });
  }
  replaceLines(id: string, data: Prisma.JournalEntryUncheckedUpdateInput, lines: Prisma.JournalLineCreateManyEntryInput[]) {
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.journalEntry.updateMany({ where: { id, status: 'DRAFT' }, data });
      if (claimed.count === 0) return false;
      await tx.journalLine.deleteMany({ where: { entryId: id } });
      await tx.journalLine.createMany({ data: lines.map((l) => ({ ...l, entryId: id })) });
      return true;
    });
  }
  async deleteDraft(id: string): Promise<boolean> {
    return (await prisma.journalEntry.deleteMany({ where: { id, status: 'DRAFT' } })).count === 1;
  }

  // ---- reports
  async sumsByAccount(churchId: string, range: { from?: Date; to?: Date }) {
    const postDate: Prisma.DateTimeFilter = {};
    if (range.from) postDate.gte = range.from;
    if (range.to) postDate.lte = range.to;
    return prisma.journalLine.groupBy({
      by: ['accountId'],
      where: { entry: { churchId, status: { in: POSTED_STATES }, ...(range.from || range.to ? { postDate } : {}) } },
      _sum: { debit: true, credit: true },
    });
  }
  async sumsByAccountAndFund(churchId: string, from: Date, to: Date) {
    return prisma.journalLine.groupBy({
      by: ['accountId', 'fundId'],
      where: { entry: { churchId, status: { in: POSTED_STATES }, postDate: { gte: from, lte: to } } },
      _sum: { debit: true, credit: true },
    });
  }
  async accountLines(accountId: string, churchId: string, range: { from?: Date; to?: Date }, take: number) {
    const postDate: Prisma.DateTimeFilter = {};
    if (range.from) postDate.gte = range.from;
    if (range.to) postDate.lte = range.to;
    return prisma.journalLine.findMany({
      where: { accountId, entry: { churchId, status: { in: POSTED_STATES }, ...(range.from || range.to ? { postDate } : {}) } },
      include: { entry: { select: { id: true, reference: true, description: true, postDate: true, status: true } } },
      orderBy: [{ entry: { postDate: 'asc' } }, { id: 'asc' }],
      take,
    });
  }
  async balanceBefore(accountId: string, churchId: string, before: Date) {
    const sum = await prisma.journalLine.aggregate({
      where: { accountId, entry: { churchId, status: { in: POSTED_STATES }, postDate: { lt: before } } },
      _sum: { debit: true, credit: true },
    });
    return sum._sum;
  }

  // ---- sync sources
  receiptsAfter(churchId: string, afterId: string | null, take: number) {
    return prisma.receipt.findMany({ where: { churchId, status: { in: ['ISSUED', 'VOIDED'] } }, orderBy: { id: 'asc' }, take, ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}) });
  }
  paidExpendituresAfter(churchId: string, afterId: string | null, take: number) {
    return prisma.expenditure.findMany({ where: { churchId, status: 'PAID', paidAt: { not: null } }, orderBy: { id: 'asc' }, take, ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}) });
  }
  findEntriesBySource(churchId: string, source: string, ids: string[]) {
    return prisma.journalEntry.findMany({ where: { churchId, source, sourceId: { in: ids } }, select: { id: true, sourceId: true, status: true } });
  }

  // ---- budgets
  listBudgets(churchId: string) {
    return prisma.budget.findMany({ where: { churchId }, orderBy: [{ fiscalYear: 'desc' }, { name: 'asc' }], include: { _count: { select: { items: true } } } });
  }
  findBudget(id: string) {
    return prisma.budget.findUnique({ where: { id }, include: { items: { include: { account: { select: { code: true, name: true, type: true } } } } } });
  }
  createBudget(data: Prisma.BudgetUncheckedCreateInput, items: Prisma.BudgetItemCreateManyBudgetInput[]) {
    return prisma.budget.create({ data: { ...data, items: { createMany: { data: items } } } });
  }
  replaceBudget(id: string, data: Prisma.BudgetUncheckedUpdateInput, items?: Prisma.BudgetItemCreateManyBudgetInput[]) {
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.budget.updateMany({ where: { id, status: 'DRAFT' }, data });
      if (claimed.count === 0) return false;
      if (items) {
        await tx.budgetItem.deleteMany({ where: { budgetId: id } });
        await tx.budgetItem.createMany({ data: items.map((i) => ({ ...i, budgetId: id })) });
      }
      return true;
    });
  }
  async transitionBudget(id: string, from: string, data: Prisma.BudgetUncheckedUpdateInput): Promise<boolean> {
    return (await prisma.budget.updateMany({ where: { id, status: from }, data })).count === 1;
  }
  findApprovedBudget(churchId: string, fiscalYear: number) {
    return prisma.budget.findFirst({ where: { churchId, fiscalYear, status: 'APPROVED' }, select: { id: true } });
  }

  // ---- funds
  listFunds(churchId: string) {
    return prisma.fund.findMany({ where: { churchId }, orderBy: { name: 'asc' } });
  }
  findFund(id: string) {
    return prisma.fund.findUnique({ where: { id } });
  }
  createFund(data: Prisma.FundUncheckedCreateInput) {
    return prisma.fund.create({ data });
  }
  updateFund(id: string, data: Prisma.FundUncheckedUpdateInput) {
    return prisma.fund.update({ where: { id }, data });
  }
  findFinanceAccount(churchId: string) {
    return prisma.financialAccount.findUnique({ where: { churchId } });
  }
  createFinanceAccount(churchId: string) {
    return prisma.financialAccount.create({ data: { churchId, openingBalance: 0, currentBalance: 0 } });
  }
  async fundIncomeAndSpend(churchId: string) {
    const [income, spend] = await Promise.all([
      prisma.receipt.groupBy({ by: ['fundId'], where: { churchId, status: { not: 'VOIDED' } }, _sum: { amount: true } }),
      prisma.expenditure.groupBy({ by: ['fundId'], where: { churchId, status: { in: ['APPROVED', 'PAID'] } }, _sum: { amount: true } }),
    ]);
    return { income, spend };
  }
  findReceipt(id: string) {
    return prisma.receipt.findUnique({ where: { id } });
  }
  findPaymentForReceipt(receiptId: string) {
    return prisma.payment.findFirst({ where: { receiptId }, select: { id: true } });
  }
  async voidReceipt(id: string): Promise<boolean> {
    return (await prisma.receipt.updateMany({ where: { id, status: 'ISSUED' }, data: { status: 'VOIDED' } })).count === 1;
  }

  // ---- cash sessions
  findOpenCashSession(churchId: string) {
    return prisma.cashSession.findFirst({ where: { churchId, status: 'OPEN' } });
  }
  findCashSession(id: string) {
    return prisma.cashSession.findUnique({ where: { id } });
  }
  createCashSession(data: Prisma.CashSessionUncheckedCreateInput) {
    return prisma.cashSession.create({ data });
  }
  async closeCashSession(id: string, data: Prisma.CashSessionUncheckedUpdateInput): Promise<boolean> {
    return (await prisma.cashSession.updateMany({ where: { id, status: 'OPEN' }, data })).count === 1;
  }
  listCashSessions(churchId: string, take: number) {
    return prisma.cashSession.findMany({ where: { churchId }, orderBy: { sessionDate: 'desc' }, take });
  }
  async cashReceiptsSince(churchId: string, since: Date) {
    const sum = await prisma.receipt.aggregate({ where: { churchId, status: 'ISSUED', paymentMethod: 'CASH', recordedAt: { gte: since } }, _sum: { amount: true } });
    return sum._sum.amount ?? new Prisma.Decimal(0);
  }

  findFundsInChurch(churchId: string, ids: string[]) {
    return prisma.fund.findMany({ where: { churchId, id: { in: ids } }, select: { id: true } });
  }
}

export const accountingRepository = new AccountingRepository();
