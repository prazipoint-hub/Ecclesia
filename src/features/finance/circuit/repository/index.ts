import { prisma } from '@/database';
import { Prisma } from '@prisma/client';

export class CircuitFinanceRepository {
  async getCircuit(circuitId: string) {
    return prisma.circuit.findUnique({
      where: { id: circuitId },
    });
  }

  async getFinanceAccount(circuitId: string) {
    return prisma.circuitFinancialAccount.findUnique({
      where: { circuitId },
    });
  }

  async createFinanceAccount(data: Prisma.CircuitFinancialAccountCreateInput) {
    return prisma.circuitFinancialAccount.create({ data });
  }

  async createReceipt(data: Prisma.CircuitReceiptCreateInput) {
    return prisma.circuitReceipt.create({ data });
  }

  async createExpenditure(data: Prisma.CircuitExpenditureCreateInput) {
    return prisma.circuitExpenditure.create({ data });
  }

  async listReceiptsByCircuit(circuitId: string, options?: { skip?: number; take?: number }) {
    const [receipts, total] = await Promise.all([
      prisma.circuitReceipt.findMany({
        where: { circuitId },
        skip: options?.skip,
        take: options?.take,
        orderBy: { issuedAt: 'desc' },
      }),
      prisma.circuitReceipt.count({ where: { circuitId } }),
    ]);

    return { receipts, total };
  }

  async listPendingExpenditures(circuitId: string, options?: { skip?: number; take?: number }) {
    const [expenditures, total] = await Promise.all([
      prisma.circuitExpenditure.findMany({
        where: {
          circuitId,
          status: 'SUBMITTED',
        },
        skip: options?.skip,
        take: options?.take,
        orderBy: { requestedAt: 'desc' },
      }),
      prisma.circuitExpenditure.count({
        where: {
          circuitId,
          status: 'SUBMITTED',
        },
      }),
    ]);

    return { expenditures, total };
  }

  async updateExpenditure(id: string, data: Prisma.CircuitExpenditureUpdateInput) {
    return prisma.circuitExpenditure.update({
      where: { id },
      data,
    });
  }

  async countReceipts(circuitId: string) {
    return prisma.circuitReceipt.count({ where: { circuitId } });
  }

  async getFinancialSummary(circuitId: string) {
    const account = await this.getFinanceAccount(circuitId);

    const [incomeAggregate, expenseAggregate] = await Promise.all([
      prisma.circuitReceipt.aggregate({
        _sum: { amount: true },
        where: { circuitId, status: { not: 'VOIDED' } },
      }),
      prisma.circuitExpenditure.aggregate({
        _sum: { amount: true },
        where: { circuitId, status: { in: ['APPROVED', 'PAID'] } },
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

export const circuitFinanceRepository = new CircuitFinanceRepository();
