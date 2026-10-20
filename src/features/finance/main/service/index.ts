import { prisma } from '@/database';
import { AuthorizedUser } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { mainChurchFinanceRepository } from '../repository';

export class MainChurchFinanceService {
  async getChurchFinanceDashboard(churchId: string, user: AuthorizedUser) {
    const church = await prisma.church.findUnique({
      where: { id: churchId },
    });

    if (!church || church.id !== user.churchId) {
      throw new Error('Unauthorized: church not found or user not in same church');
    }

    if (!user.permissions.includes('finance:view')) {
      throw new Error('Unauthorized: finance:view permission required');
    }

    const summary = await mainChurchFinanceRepository.getFinancialSummary(churchId);
    const { receipts } = await mainChurchFinanceRepository.listReceiptsByChurch(churchId, { take: 10 });
    const { expenditures } = await mainChurchFinanceRepository.listPendingExpenditures(churchId, { take: 10 });

    return {
      church,
      summary,
      recentReceipts: receipts,
      pendingExpenditures: expenditures,
    };
  }

  async createChurchReceipt(
    data: {
      churchId: string;
      memberId?: string;
      fundId: string;
      incomeType: string;
      amount: number;
      currency: string;
      paymentMethod: string;
      reference?: string;
    },
    user: AuthorizedUser
  ) {
    if (!user.permissions.includes('finance:receipt:create')) {
      throw new Error('Unauthorized: finance:receipt:create permission required');
    }

    const church = await prisma.church.findUnique({ where: { id: data.churchId } });
    if (!church || church.id !== user.churchId) {
      throw new Error('Unauthorized: church not found or user not in same church');
    }

    let account = await mainChurchFinanceRepository.getFinanceAccount(data.churchId);
    if (!account) {
      account = await mainChurchFinanceRepository.createFinanceAccount({
        churchId: data.churchId,
        openingBalance: 0,
        currentBalance: 0,
        status: 'ACTIVE',
      });
    }

    const count = await mainChurchFinanceRepository.countReceipts(data.churchId);
    const year = new Date().getFullYear();
    const receiptNumber = `CH-${year}-${String(count + 1).padStart(6, '0')}`;

    const receipt = await mainChurchFinanceRepository.createReceipt({
      id: uuidv4(),
      churchId: data.churchId,
      fundId: data.fundId,
      memberId: data.memberId || null,
      amount: data.amount,
      currency: data.currency,
      incomeType: data.incomeType,
      paymentMethod: data.paymentMethod,
      receiptNumber,
      status: 'ISSUED',
      recordedAt: new Date(),
      recordedBy: user.id,
    });

    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        action: 'CHURCH_RECEIPT_CREATED',
        actorId: user.id,
        entityType: 'FINANCE',
        entityId: data.churchId,
        churchId: data.churchId,
        changes: JSON.stringify({ receipt }),
        timestamp: new Date(),
      },
    });

    return receipt;
  }

  async createChurchExpenditure(
    data: {
      churchId: string;
      fundId: string;
      amount: number;
      purpose: string;
      category: string;
      description?: string;
      requestedBy: string;
    },
    user: AuthorizedUser
  ) {
    if (!user.permissions.includes('finance:expenditure:create')) {
      throw new Error('Unauthorized: finance:expenditure:create permission required');
    }

    const church = await prisma.church.findUnique({ where: { id: data.churchId } });
    if (!church || church.id !== user.churchId) {
      throw new Error('Unauthorized: church not found or user not in same church');
    }

    const summary = await mainChurchFinanceRepository.getFinancialSummary(data.churchId);
    if (summary.currentBalance < data.amount) {
      throw new Error(
        `Insufficient church balance. Available: $${summary.currentBalance}, Requested: $${data.amount}`
      );
    }

    const expenditure = await mainChurchFinanceRepository.createExpenditure({
      id: uuidv4(),
      churchId: data.churchId,
      fundId: data.fundId,
      requestedBy: data.requestedBy,
      amount: data.amount,
      purpose: data.purpose,
      category: data.category,
      status: 'SUBMITTED',
      createdAt: new Date(),
    });

    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        action: 'CHURCH_EXPENDITURE_REQUESTED',
        actorId: user.id,
        entityType: 'FINANCE',
        entityId: data.churchId,
        churchId: data.churchId,
        changes: JSON.stringify({ expenditure }),
        timestamp: new Date(),
      },
    });

    return expenditure;
  }

  async listPendingExpenditures(churchId: string, user: AuthorizedUser, options?: { skip?: number; take?: number }) {
    const church = await prisma.church.findUnique({ where: { id: churchId } });
    if (!church || church.id !== user.churchId) {
      throw new Error('Unauthorized: church not found or user not in same church');
    }

    if (!user.permissions.includes('finance:expenditure:approve')) {
      throw new Error('Unauthorized: finance:expenditure:approve permission required');
    }

    const { expenditures, total } = await mainChurchFinanceRepository.listPendingExpenditures(churchId, options);

    return {
      churchId,
      expenditures,
      total,
      skip: options?.skip ?? 0,
      take: options?.take ?? 20,
    };
  }

  async approveChurchExpenditure(
    expenditureId: string,
    approved: boolean,
    approverNotes: string | undefined,
    user: AuthorizedUser,
    churchId?: string
  ) {
    if (!user.permissions.includes('finance:expenditure:approve')) {
      throw new Error('Unauthorized: finance:expenditure:approve permission required');
    }

    const expenditure = await prisma.expenditure.findUnique({
      where: { id: expenditureId },
    });

    if (!expenditure) {
      throw new Error('Expenditure not found');
    }

    if (churchId && expenditure.churchId !== churchId) {
      throw new Error('Expenditure does not belong to the provided church');
    }

    const church = await prisma.church.findUnique({ where: { id: expenditure.churchId } });
    if (!church || church.id !== user.churchId) {
      throw new Error('Unauthorized: church not found or user not in same church');
    }

    if (expenditure.status !== 'SUBMITTED') {
      throw new Error(`Cannot approve: expenditure status is ${expenditure.status}`);
    }

    const updated = await mainChurchFinanceRepository.updateExpenditure(expenditureId, {
      status: approved ? 'APPROVED' : 'REJECTED',
      approvedBy: user.id,
      approvedAt: new Date(),
    });

    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        action: approved ? 'CHURCH_EXPENDITURE_APPROVED' : 'CHURCH_EXPENDITURE_REJECTED',
        actorId: user.id,
        entityType: 'FINANCE',
        entityId: expenditure.churchId,
        churchId: expenditure.churchId,
        changes: JSON.stringify({ expenditureId, approved, approverNotes }),
        timestamp: new Date(),
      },
    });

    return updated;
  }

  async paymentChurchExpenditure(
    expenditureId: string,
    paymentMethod: string,
    user: AuthorizedUser,
    churchId?: string
  ) {
    if (!user.permissions.includes('finance:payment:create')) {
      throw new Error('Unauthorized: finance:payment:create permission required');
    }

    const expenditure = await prisma.expenditure.findUnique({ where: { id: expenditureId } });
    if (!expenditure) {
      throw new Error('Expenditure not found');
    }

    if (churchId && expenditure.churchId !== churchId) {
      throw new Error('Expenditure does not belong to the provided church');
    }

    if (expenditure.status !== 'APPROVED') {
      throw new Error('Can only pay approved expenditures');
    }

    const updated = await mainChurchFinanceRepository.updateExpenditure(expenditureId, {
      status: 'PAID',
      paidAt: new Date(),
    });

    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        action: 'CHURCH_EXPENDITURE_PAID',
        actorId: user.id,
        entityType: 'FINANCE',
        entityId: expenditure.churchId,
        churchId: expenditure.churchId,
        changes: JSON.stringify({ expenditureId, paymentMethod }),
        timestamp: new Date(),
      },
    });

    return updated;
  }
}

export const mainChurchFinanceService = new MainChurchFinanceService();
