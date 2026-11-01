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

    const fund = await prisma.fund.findFirst({ where: { id: data.fundId, churchId: data.churchId } });
    if (!fund) throw new Error('Fund not found');
    if (fund.isActive === false) throw new Error('Invalid: this fund is inactive and cannot receive money');

    if (data.memberId) {
      const member = await prisma.member.findFirst({ where: { id: data.memberId, churchId: data.churchId } });
      if (!member) throw new Error('Member not found');
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

    // The expenditure table links the requester to a member record, and the requester is always the signed-in user.
    if (!user.memberId) {
      throw new Error('Invalid: your account is not linked to a member, so it cannot file expenditure requests');
    }

    const fund = await prisma.fund.findFirst({ where: { id: data.fundId, churchId: data.churchId } });
    if (!fund) throw new Error('Fund not found');
    if (fund.isActive === false) throw new Error('Invalid: this fund is inactive and cannot be spent from');

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
      requestedBy: user.memberId,
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

    // The person who asked for the money cannot be the one who releases it.
    if (approved && [user.id, user.memberId].some((id) => id && id === expenditure.requestedBy)) {
      throw new Error('Cannot approve your own request');
    }

    const updated = await mainChurchFinanceRepository.claimExpenditure(expenditureId, 'SUBMITTED', { churchId: expenditure.churchId }, {
      status: approved ? 'APPROVED' : 'REJECTED',
      approvedBy: user.id,
      approvedAt: new Date(),
    });
    if (!updated) {
      throw new Error('Cannot approve: this expenditure was already decided');
    }

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

    // A user may only pay their own church's expenditures, whatever church id the URL names.
    if (expenditure.churchId !== user.churchId) {
      throw new Error('Unauthorized: expenditure belongs to another church');
    }

    if (expenditure.status !== 'APPROVED') {
      throw new Error('Can only pay approved expenditures');
    }

    const updated = await mainChurchFinanceRepository.claimExpenditure(expenditureId, 'APPROVED', { churchId: expenditure.churchId }, {
      status: 'PAID',
      paidAt: new Date(),
    });
    if (!updated) {
      throw new Error('Cannot pay: this expenditure was already paid or changed');
    }

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
