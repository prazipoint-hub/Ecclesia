import { prisma } from '@/database';
import { Prisma } from '@prisma/client';

export class DistrictFinanceRepository {
  async getCircuit(circuitId: string) {
    return prisma.circuit.findUnique({
      where: { id: circuitId },
    });
  }

  async getFinanceAccount(circuitId: string) {
    return prisma.districtFinancialAccount.findUnique({
      where: { circuitId },
    });
  }

  async createFinanceAccount(data: Prisma.DistrictFinancialAccountCreateInput) {
    return prisma.districtFinancialAccount.create({ data });
  }

  async createReceipt(data: Prisma.DistrictReceiptCreateInput) {
    return prisma.districtReceipt.create({ data });
  }

  async createExpenditure(data: Prisma.DistrictExpenditureCreateInput) {
    return prisma.districtExpenditure.create({ data });
  }

  async listReceiptsByDistrict(circuitId: string, options?: { skip?: number; take?: number }) {
    const [receipts, total] = await Promise.all([
      prisma.districtReceipt.findMany({
        where: { circuitId },
        skip: options?.skip,
        take: options?.take,
        orderBy: { issuedAt: 'desc' },
      }),
      prisma.districtReceipt.count({ where: { circuitId } }),
    ]);

    return { receipts, total };
  }

  async listPendingExpenditures(circuitId: string, options?: { skip?: number; take?: number }) {
    const [expenditures, total] = await Promise.all([
      prisma.districtExpenditure.findMany({
        where: {
          circuitId,
          status: 'SUBMITTED',
        },
        skip: options?.skip,
        take: options?.take,
        orderBy: { requestedAt: 'desc' },
      }),
      prisma.districtExpenditure.count({
        where: {
          circuitId,
          status: 'SUBMITTED',
        },
      }),
    ]);

    return { expenditures, total };
  }

  async updateExpenditure(id: string, data: Prisma.DistrictExpenditureUpdateInput) {
    return prisma.districtExpenditure.update({
      where: { id },
      data,
    });
  }

  async countReceipts(circuitId: string) {
    return prisma.districtReceipt.count({ where: { circuitId } });
  }

  async getFinancialSummary(circuitId: string) {
    const account = await this.getFinanceAccount(circuitId);

    const [incomeAggregate, expenseAggregate] = await Promise.all([
      prisma.districtReceipt.aggregate({
        _sum: { amount: true },
        where: { circuitId, status: { not: 'VOIDED' } },
      }),
      prisma.districtExpenditure.aggregate({
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

export const districtFinanceRepository = new DistrictFinanceRepository();
