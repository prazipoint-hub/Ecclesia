import { AuthorizedUser } from '@/types';
import { districtFinanceRepository } from '../repository';

export class DistrictFinanceService {
  async getCircuitFinanceDashboard(circuitId: string, user: AuthorizedUser) {
    const circuit = await districtFinanceRepository.getCircuit(circuitId);

    if (!circuit) {
      throw new Error('Circuit not found');
    }

    if (user.churchId && !user.permissions.includes('finance:view:all_churches')) {
      const userChurch = await prisma.church.findFirst({
        where: { id: user.churchId, circuitId },
      });

      if (!userChurch) {
        throw new Error('Unauthorized: cannot view district finance for another circuit');
      }
    }

    const churches = await districtFinanceRepository.listChurches(circuitId);
    const churchIds = churches.map((church) => church.id);

    const [receipts, expenditures] = await Promise.all([
      districtFinanceRepository.listReceiptsForCircuit(churchIds),
      districtFinanceRepository.listExpendituresForCircuit(churchIds),
    ]);

    const totalIncome = receipts.reduce((sum, receipt) => sum + Number(receipt.amount), 0);
    const totalExpense = expenditures.reduce((sum, expenditure) => sum + Number(expenditure.amount), 0);
    const netBalance = totalIncome - totalExpense;

    const churchMetrics = churches.map((church) => {
      const churchReceipts = receipts.filter((receipt) => receipt.churchId === church.id);
      const churchExpenditures = expenditures.filter((expenditure) => expenditure.churchId === church.id);
      const totalIncomeForChurch = churchReceipts.reduce((sum, receipt) => sum + Number(receipt.amount), 0);
      const totalExpenseForChurch = churchExpenditures.reduce((sum, expenditure) => sum + Number(expenditure.amount), 0);
      const currentBalance = Number(church.financialAccount?.currentBalance ?? 0);

      return {
        churchId: church.id,
        churchName: church.name,
        totalIncome: totalIncomeForChurch,
        totalExpense: totalExpenseForChurch,
        currentBalance,
        status: church.financialAccount?.status ?? 'ACTIVE',
      };
    });

    return {
      circuitId: circuit.id,
      circuitName: circuit.name,
      totalChurches: churches.length,
      totalIncome,
      totalExpense,
      netBalance,
      churchMetrics,
    };
  }

  async listPendingExpenditures(circuitId: string, user: AuthorizedUser, options?: { skip?: number; take?: number }) {
    const circuit = await districtFinanceRepository.getCircuit(circuitId);

    if (!circuit) {
      throw new Error('Circuit not found');
    }

    if (user.churchId && !user.permissions.includes('finance:view:all_churches')) {
      const userChurch = await prisma.church.findFirst({
        where: { id: user.churchId, circuitId },
      });

      if (!userChurch) {
        throw new Error('Unauthorized: cannot view district finance for another circuit');
      }
    }

    const { items, total } = await districtFinanceRepository.listPendingExpenditures(circuitId, options);

    return {
      items: items.map((item) => ({
        id: item.id,
        churchId: item.churchId,
        churchName: item.church.name,
        amount: Number(item.amount),
        purpose: item.purpose,
        category: item.category,
        requestedBy: item.requestedBy,
        status: item.status,
        createdAt: item.createdAt.toISOString(),
      })),
      total,
      skip: options?.skip ?? 0,
      take: options?.take ?? 20,
    };
  }
}

export const districtFinanceService = new DistrictFinanceService();
