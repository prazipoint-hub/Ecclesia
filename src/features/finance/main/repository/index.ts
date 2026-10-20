import { Prisma } from '@prisma/client';
import { prisma } from '@/database';

export class MainChurchFinanceRepository {
  async getFinanceAccount(churchId: string) {
    return prisma.financialAccount.findUnique({
      where: { churchId },
    });
  }

  async createFinanceAccount(data: Prisma.FinancialAccountCreateInput) {
    return prisma.financialAccount.create({ data });
  }

  async createReceipt(data: Prisma.ReceiptCreateInput) {
    return prisma.receipt.create({ data });
  }

  async createExpenditure(data: Prisma.ExpenditureCreateInput) {
    return prisma.expenditure.create({ data });
  }

  async listReceiptsByChurch(churchId: string, options?: { skip?: number; take?: number }) {
    const [receipts, total] = await Promise.all([
      prisma.receipt.findMany({
        where: { churchId },
        skip: options?.skip,
        take: options?.take,
        orderBy: { recordedAt: 'desc' },
      }),
      prisma.receipt.count({ where: { churchId } }),
    ]);

    return { receipts, total };
  }

  async listPendingExpenditures(churchId: string, options?: { skip?: number; take?: number }) {
    const [expenditures, total] = await Promise.all([
      prisma.expenditure.findMany({
        where: {
          churchId,
          status: 'SUBMITTED',
        },
        skip: options?.skip,
        take: options?.take,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.expenditure.count({
        where: {
          churchId,
          status: 'SUBMITTED',
        },
      }),
    ]);

    return { expenditures, total };
  }

  async updateExpenditure(id: string, data: Prisma.ExpenditureUpdateInput) {
    return prisma.expenditure.update({
      where: { id },
      data,
    });
  }

  async countReceipts(churchId: string) {
    return prisma.receipt.count({ where: { churchId } });
  }

  async getFinancialSummary(churchId: string) {
    const account = await this.getFinanceAccount(churchId);

    const [incomeAggregate, expenseAggregate] = await Promise.all([
      prisma.receipt.aggregate({
        _sum: { amount: true },
        where: { churchId, status: { not: 'VOIDED' } },
      }),
      prisma.expenditure.aggregate({
        _sum: { amount: true },
        where: { churchId, status: { in: ['APPROVED', 'PAID'] } },
      }),
    ]);

    const openingBalance = Number(account?.openingBalance ?? 0);
    const totalIncome = Number(incomeAggregate._sum.amount ?? 0);
    const totalExpense = Number(expenseAggregate._sum.amount ?? 0);
    const currentBalance = openingBalance + totalIncome - totalExpense;

    return {
      openingBalance,
      totalIncome,
      totalExpense,
      currentBalance,
    };
  }
}

export const mainChurchFinanceRepository = new MainChurchFinanceRepository();
