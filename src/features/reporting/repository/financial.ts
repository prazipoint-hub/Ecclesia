import { prisma } from '@/database';
import { AuthorizedUser } from '@/types';

/**
 * FINANCIAL REPORTING REPOSITORY
 *
 * Aggregates financial data for reports without mutating business transactions.
 * All queries are read-only and explicitly scope by churchId, organizationId, or sectionId.
 */
export class FinancialReportRepository {
  /**
   * Get income statement data
   * Income Statement = Income - Expense = Net Income
   */
  async getIncomeStatementData(
    churchId: string,
    startDate: Date,
    endDate: Date,
    organizationId?: string,
    sectionId?: string
  ) {
    const where: any = {
      churchId,
      issuedAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (organizationId) {
      where.organizationId = organizationId;
    } else if (sectionId) {
      // For sections, use SectionReceipt
      const receipts = await prisma.sectionReceipt.aggregate({
        where: { sectionId, issuedAt: { gte: startDate, lte: endDate } },
        _sum: { amount: true },
      });

      const expenditures = await prisma.sectionExpenditure.aggregate({
        where: { sectionId, requestedAt: { gte: startDate, lte: endDate }, status: 'PAID' },
        _sum: { amount: true },
      });

      const totalIncome = Number(receipts._sum.amount || 0);
      const totalExpense = Number(expenditures._sum.amount || 0);

      return {
        totalIncome,
        totalExpense,
        netIncome: totalIncome - totalExpense,
        scope: `Section: ${sectionId}`,
      };
    } else {
      // Main church: only where organizationId IS NULL and sectionId IS NULL
      where.organizationId = null;
    }

    // Get organization or main church receipts
    const receipts = await prisma.receipt.aggregate({
      where,
      _sum: { amount: true },
    });

    // Get organization or main church expenditures (approved and paid)
    const expenditures = await prisma.expenditure.aggregate({
      where: {
        ...where,
        status: 'PAID',
      },
      _sum: { amount: true },
    });

    const totalIncome = Number(receipts._sum.amount || 0);
    const totalExpense = Number(expenditures._sum.amount || 0);

    return {
      totalIncome,
      totalExpense,
      netIncome: totalIncome - totalExpense,
      scope: organizationId ? `Organization: ${organizationId}` : 'Main Church',
    };
  }

  /**
   * Get trial balance (journal entries by account)
   */
  async getTrialBalanceData(churchId: string, date: Date, organizationId?: string, sectionId?: string) {
    const where: any = { churchId, issuedAt: { lte: date } };

    if (organizationId) {
      where.organizationId = organizationId;
    } else if (sectionId) {
      const entries = await prisma.sectionJournalEntry.findMany({
        where: { sectionId, postedAt: { lte: date } },
      });

      return entries.map((e) => ({
        account: e.description,
        debit: Number(e.debitAmount || 0),
        credit: Number(e.creditAmount || 0),
      }));
    }

    const [receipts, expenditures] = await Promise.all([
      prisma.receipt.findMany({ where, select: { incomeType: true, amount: true } }),
      prisma.expenditure.findMany({
        where: { churchId, paidAt: { lte: date }, status: 'PAID', ...(organizationId ? { organizationId } : {}) },
        select: { category: true, amount: true },
      }),
    ]);

    return [
      ...receipts.map((receipt) => ({ account: receipt.incomeType, debit: Number(receipt.amount), credit: 0 })),
      ...expenditures.map((expenditure) => ({ account: expenditure.category, debit: 0, credit: Number(expenditure.amount) })),
    ];
  }

  /**
   * Get receipt details
   */
  async getReceiptDetails(churchId: string, startDate: Date, endDate: Date, organizationId?: string, sectionId?: string) {
    const where: any = {
      churchId,
      issuedAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (sectionId) {
      return prisma.sectionReceipt.findMany({
        where: { sectionId, issuedAt: { gte: startDate, lte: endDate } },
        include: { member: true },
        orderBy: { issuedAt: 'desc' },
      });
    }

    if (organizationId) {
      where.organizationId = organizationId;
    } else {
      where.organizationId = null;
    }

    return prisma.receipt.findMany({
      where,
      include: { member: true },
      orderBy: { issuedAt: 'desc' },
    });
  }

  /**
   * Get expenditure details
   */
  async getExpenditureDetails(
    churchId: string,
    startDate: Date,
    endDate: Date,
    organizationId?: string,
    sectionId?: string
  ) {
    const where: any = {
      churchId,
      requestedAt: {
        gte: startDate,
        lte: endDate,
      },
      status: 'PAID', // Only paid expenditures in reports
    };

    if (sectionId) {
      return prisma.sectionExpenditure.findMany({
        where: { sectionId, requestedAt: { gte: startDate, lte: endDate }, status: 'PAID' },
        orderBy: { requestedAt: 'desc' },
      });
    }

    if (organizationId) {
      where.organizationId = organizationId;
    } else {
      where.organizationId = null;
    }

    return prisma.expenditure.findMany({
      where,
      orderBy: { requestedAt: 'desc' },
    });
  }

  /**
   * Get financial account balance at date
   */
  async getAccountBalance(churchId: string, date: Date, organizationId?: string, sectionId?: string) {
    if (sectionId) {
      const account = await prisma.sectionFinancialAccount.findUnique({
        where: { sectionId },
      });
      return Number(account?.currentBalance || 0);
    }

    if (organizationId) {
      const account = await prisma.organizationFinancialAccount.findUnique({
        where: { organizationId },
      });
      return Number(account?.currentBalance || 0);
    }

    // Main church account
    const account = await prisma.financialAccount.findFirst({
      where: { churchId, type: 'OPERATING' },
    });

    return Number(account?.currentBalance || 0);
  }
}

export const financialReportRepository = new FinancialReportRepository();
