import { Prisma } from '@prisma/client';
import { prisma } from '@/database';
import { AuthorizedUser } from '@/types';
import { ConflictError } from '@/types/errors';
import { v4 as uuidv4 } from 'uuid';
import { mainChurchFinanceRepository } from '../repository';
import { gate as approvalGate, assertPayer } from '@/features/finance/shared/approvalPolicy';

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
    user: AuthorizedUser,
    idempotencyKey?: string
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

    // A retry or double-click with the same key returns the receipt already issued instead of a second one.
    // The same key with a different payment is a client bug and is refused rather than silently ignored.
    if (idempotencyKey) {
      const prior = await prisma.receipt.findFirst({ where: { churchId: data.churchId, idempotencyKey } });
      if (prior) return this.replay(prior, data);
    }

    // A cash receipt belongs to the cashier's own open session, so each session owns exactly the cash it took.
    // No open session (or a non-cash method) leaves it unattached, as before.
    let cashSessionId: string | null = null;
    if (data.paymentMethod === 'CASH' && user.memberId) {
      const open = await prisma.cashSession.findFirst({ where: { churchId: data.churchId, handledBy: user.memberId, status: 'OPEN' }, select: { id: true } });
      cashSessionId = open?.id ?? null;
    }

    const year = new Date().getFullYear();
    for (let attempt = 1; ; attempt += 1) {
      try {
        // Number, receipt and audit entry commit together or not at all: no gaps from a failed insert, no receipt without its audit row.
        return await prisma.$transaction(async (tx) => {
          const last = await tx.receipt.findFirst({ where: { churchId: data.churchId, receiptNumber: { startsWith: `CH-${year}-` } }, orderBy: { receiptNumber: 'desc' }, select: { receiptNumber: true } });
          const floor = Number(last?.receiptNumber.slice(`CH-${year}-`.length)) || 0; // continues existing numbering the first time only
          const seq = await tx.receiptSequence.upsert({
            where: { churchId_year: { churchId: data.churchId, year } },
            create: { churchId: data.churchId, year, last: floor + 1 },
            update: { last: { increment: 1 } },
          });
          const receipt = await tx.receipt.create({
            data: {
              id: uuidv4(),
              churchId: data.churchId,
              fundId: data.fundId,
              memberId: data.memberId || null,
              amount: data.amount,
              currency: data.currency,
              incomeType: data.incomeType,
              paymentMethod: data.paymentMethod,
              receiptNumber: `CH-${year}-${String(seq.last).padStart(6, '0')}`,
              reference: data.reference ?? null,
              idempotencyKey: idempotencyKey ?? null,
              cashSessionId,
              status: 'ISSUED',
              recordedAt: new Date(),
              recordedBy: user.id,
            },
          });
          await tx.auditLog.create({
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
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
        // Lost a race. If it was the same request arriving twice, return the winner; if it was the number, draw again.
        if (idempotencyKey) {
          const winner = await prisma.receipt.findFirst({ where: { churchId: data.churchId, idempotencyKey } });
          if (winner) return this.replay(winner, data);
        }
        if (attempt >= 5) throw new ConflictError('Could not allocate a receipt number; please try again');
      }
    }
  }

  private replay(prior: { fundId: string; amount: unknown; currency: string; paymentMethod: string; incomeType: string; memberId: string | null }, data: { fundId: string; amount: number; currency: string; paymentMethod: string; incomeType: string; memberId?: string }) {
    const same =
      prior.fundId === data.fundId && Number(prior.amount) === data.amount && prior.currency === data.currency &&
      prior.paymentMethod === data.paymentMethod && prior.incomeType === data.incomeType && (prior.memberId ?? null) === (data.memberId ?? null);
    if (!same) throw new ConflictError('This idempotency key was already used for a different receipt');
    return { ...prior, replayed: true };
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

  /** Church expenditures by status, with how many people have approved so far (for the two-approver rule). */
  async listExpenditures(churchId: string, user: AuthorizedUser, status?: string) {
    if (churchId !== user.churchId) throw new Error('Unauthorized: church not found or user not in same church');
    if (!user.permissions.includes('finance:view')) throw new Error('Unauthorized: finance:view permission required');
    const allowed = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID'];
    const rows = await prisma.expenditure.findMany({ where: { churchId, ...(status && allowed.includes(status) ? { status } : {}) }, orderBy: { createdAt: 'desc' }, take: 200 });
    const approvals = rows.length ? await prisma.expenditureApproval.groupBy({ by: ['expenditureId'], where: { kind: 'CHURCH', expenditureId: { in: rows.map((r) => r.id) }, decision: 'APPROVED' }, _count: { _all: true } }) : [];
    const n = new Map(approvals.map((a) => [a.expenditureId, a._count._all]));
    return rows.map((r) => ({ id: r.id, fundId: r.fundId, amount: Number(r.amount), purpose: r.purpose, category: r.category, status: r.status, requestedAt: r.requestedAt, approvedAt: r.approvedAt, paidAt: r.paidAt, approvalsRecorded: n.get(r.id) ?? 0 }));
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

    const gated = await approvalGate(user, 'CHURCH', expenditureId, expenditure.amount, approved, approverNotes);
    if (gated.waiting) return { ...expenditure, awaitingSecondApproval: true, approvalsRecorded: gated.approvals, approvalsNeeded: gated.needed };

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

    await assertPayer(user, 'CHURCH', expenditureId, expenditure.requestedBy);

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
