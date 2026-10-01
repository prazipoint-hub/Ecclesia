import { prisma } from '@/database';

export class DistrictFinanceRepository {
  async getCircuit(circuitId: string) {
    return prisma.circuit.findUnique({
      where: { id: circuitId },
    });
  }

  async listChurches(circuitId: string) {
    return prisma.church.findMany({
      where: { circuitId },
      include: {
        financialAccount: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async listReceiptsForCircuit(churchIds: string[]) {
    if (churchIds.length === 0) return [];

    return prisma.receipt.findMany({
      where: {
        churchId: { in: churchIds },
      },
      include: {
        church: true,
      },
    });
  }

  async listExpendituresForCircuit(churchIds: string[]) {
    if (churchIds.length === 0) return [];

    return prisma.expenditure.findMany({
      where: {
        churchId: { in: churchIds },
      },
      include: {
        church: true,
        fund: true,
      },
    });
  }

  async listPendingExpenditures(circuitId: string, options?: { skip?: number; take?: number }) {
    const churchIds = await prisma.church.findMany({
      where: { circuitId },
      select: { id: true },
    }).then((rows) => rows.map((row) => row.id));

    if (churchIds.length === 0) {
      return { items: [], total: 0 };
    }

    const [items, total] = await Promise.all([
      prisma.expenditure.findMany({
        where: {
          churchId: { in: churchIds },
          status: 'SUBMITTED',
        },
        include: {
          church: true,
          fund: true,
        },
        skip: options?.skip,
        take: options?.take,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.expenditure.count({
        where: {
          churchId: { in: churchIds },
          status: 'SUBMITTED',
        },
      }),
    ]);

    return { items, total };
  }
}

export const districtFinanceRepository = new DistrictFinanceRepository();
