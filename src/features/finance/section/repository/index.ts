import { prisma } from '@/database';
import { Prisma } from '@prisma/client';
import { AuthorizedUser } from '@/types';

/**
 * SECTION FINANCE REPOSITORY
 *
 * All section finance operations must include sectionId to enforce isolation.
 * Queries without sectionId filtering will be treated as authorization violations.
 */
export class SectionFinanceRepository {
  /**
   * Get section finance account
   * Authorization: User must be from same church AND have section:finance:view permission
   */
  async getSectionFinanceAccount(sectionId: string, user: AuthorizedUser) {
    // Verify section exists and user's church matches
    const section = await prisma.section.findUnique({
      where: { id: sectionId },
    });

    if (!section || section.churchId !== user.churchId) {
      return null;
    }

    return prisma.sectionFinancialAccount.findUnique({
      where: { sectionId },
    });
  }

  /**
   * Create section financial account (one per section)
   */
  async createFinanceAccount(
    data: Prisma.SectionFinancialAccountCreateInput
  ) {
    return prisma.sectionFinancialAccount.create({ data });
  }

  /**
   * Record section receipt
   * CRITICAL: Every receipt must have sectionId
   */
  async createReceipt(
    data: Prisma.SectionReceiptCreateInput
  ) {
    return prisma.sectionReceipt.create({ data });
  }

  /**
   * List section receipts for a section
   * Authorization: Caller must verify they have access to this section
   */
  async listReceiptsBySection(
    sectionId: string,
    options?: { skip?: number; take?: number }
  ) {
    const [receipts, total] = await Promise.all([
      prisma.sectionReceipt.findMany({
        where: { sectionId },
        skip: options?.skip,
        take: options?.take,
        orderBy: { issuedAt: 'desc' },
      }),
      prisma.sectionReceipt.count({ where: { sectionId } }),
    ]);

    return { receipts, total };
  }

  /**
   * Record section expenditure request
   */
  async createExpenditure(
    data: Prisma.SectionExpenditureCreateInput
  ) {
    return prisma.sectionExpenditure.create({ data });
  }

  /**
   * List pending section expenditures for approval
   */
  async listPendingExpenditures(
    sectionId: string,
    options?: { skip?: number; take?: number }
  ) {
    const [expenditures, total] = await Promise.all([
      prisma.sectionExpenditure.findMany({
        where: {
          sectionId,
          status: 'SUBMITTED',
        },
        skip: options?.skip,
        take: options?.take,
        orderBy: { requestedAt: 'desc' },
      }),
      prisma.sectionExpenditure.count({
        where: {
          sectionId,
          status: 'SUBMITTED',
        },
      }),
    ]);

    return { expenditures, total };
  }

  /**
   * Update expenditure approval status
   */
  async updateExpenditure(
    id: string,
    data: Prisma.SectionExpenditureUpdateInput
  ) {
    return prisma.sectionExpenditure.update({
      where: { id },
      data,
    });
  }

  /**
   * Get section financial summary
   * Returns: opening balance + income - expense = current balance
   */
  async getSectionFinancialSummary(sectionId: string): Promise<{
    openingBalance: number;
    totalIncome: number;
    totalExpense: number;
    currentBalance: number;
  }> {
    const account = await prisma.sectionFinancialAccount.findUnique({
      where: { sectionId },
    });

    if (!account) {
      throw new Error('Section financial account not found');
    }

    const [incomeResult, expenseResult] = await Promise.all([
      prisma.sectionReceipt.aggregate({
        where: { sectionId },
        _sum: { amount: true },
      }),
      prisma.sectionExpenditure.aggregate({
        where: { sectionId, status: 'PAID' },
        _sum: { amount: true },
      }),
    ]);

    const totalIncome = incomeResult._sum.amount || 0;
    const totalExpense = expenseResult._sum.amount || 0;
    const currentBalance = account.openingBalance + totalIncome - totalExpense;

    return {
      openingBalance: account.openingBalance,
      totalIncome,
      totalExpense,
      currentBalance,
    };
  }

  /**
   * CRITICAL: Count receipts by section to prevent section financial contamination
   * Only counts receipts where sectionId = provided sectionId
   */
  async countSectionReceipts(sectionId: string): Promise<number> {
    return prisma.sectionReceipt.count({
      where: { sectionId },
    });
  }
}

export const sectionFinanceRepository = new SectionFinanceRepository();
