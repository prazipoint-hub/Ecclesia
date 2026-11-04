import { prisma } from '@/database';
import { AuthorizedUser } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { circuitFinanceRepository } from '../repository';

/**
 * CIRCUIT FINANCE SERVICE
 *
 * CRITICAL PRINCIPLES:
 *
 * 1. Circuit finances are completely isolated from church finances
 * 2. Circuit Treasurer can operate circuit finances
 * 3. Circuit Leadership can APPROVE expenditures
 * 4. Every transaction must carry circuitId for isolation enforcement
 * 5. No automatic mixing of circuit and church funds
 * 6. Circuit receives consolidated receipts from churches (transfers)
 */

export class CircuitFinanceService {
  async getCircuitFinanceDashboard(circuitId: string, user: AuthorizedUser) {
    const circuit = await prisma.circuit.findUnique({
      where: { id: circuitId },
    });

    if (!circuit) {
      throw new Error('Circuit not found');
    }

    if (!user.permissions.includes('circuit_finance:view')) {
      throw new Error('Unauthorized: circuit_finance:view permission required');
    }

    const summary = await circuitFinanceRepository.getFinancialSummary(circuitId);
    const { receipts } = await circuitFinanceRepository.listReceiptsByCircuit(circuitId, { take: 10 });
    const { expenditures } = await circuitFinanceRepository.listPendingExpenditures(circuitId, { take: 10 });

    return {
      circuit,
      summary,
      recentReceipts: receipts,
      pendingExpenditures: expenditures,
    };
  }

  async createCircuitReceipt(
    data: {
      circuitId: string;
      memberId?: string;
      incomeType: string;
      amount: number;
      currency: string;
      paymentMethod: string;
      reference?: string;
      description?: string;
    },
    user: AuthorizedUser
  ) {
    if (!user.permissions.includes('circuit_receipt:create')) {
      throw new Error('Unauthorized: circuit_receipt:create permission required');
    }

    const circuit = await prisma.circuit.findUnique({ where: { id: data.circuitId } });
    if (!circuit) {
      throw new Error('Circuit not found');
    }

    let account = await circuitFinanceRepository.getFinanceAccount(data.circuitId);
    if (!account) {
      account = await circuitFinanceRepository.createFinanceAccount({
        circuitId: data.circuitId,
        openingBalance: 0,
        currentBalance: 0,
        status: 'ACTIVE',
      });
    }

    const count = await circuitFinanceRepository.countReceipts(data.circuitId);
    const year = new Date().getFullYear();
    const receiptNumber = `CIR-${year}-${String(count + 1).padStart(6, '0')}`;

    const receipt = await circuitFinanceRepository.createReceipt({
      id: uuidv4(),
      circuitId: data.circuitId,
      memberId: data.memberId || null,
      amount: data.amount,
      currency: data.currency,
      incomeType: data.incomeType,
      paymentMethod: data.paymentMethod,
      receiptNumber,
      reference: data.reference || null,
      description: data.description || null,
      status: 'ISSUED',
      issuedBy: user.id,
      issuedAt: new Date(),
    });

    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        action: 'CIRCUIT_RECEIPT_CREATED',
        actorId: user.id,
        entityType: 'CIRCUIT_FINANCE',
        entityId: data.circuitId,
        churchId: user.churchId,
        changes: JSON.stringify({ receipt }),
        timestamp: new Date(),
      },
    });

    return receipt;
  }

  async createCircuitExpenditure(
    data: {
      circuitId: string;
      amount: number;
      purpose: string;
      expenseCategory: string;
      description?: string;
      requestedBy: string;
      attachments?: string[];
    },
    user: AuthorizedUser
  ) {
    if (!user.permissions.includes('circuit_expenditure:create')) {
      throw new Error('Unauthorized: circuit_expenditure:create permission required');
    }

    const circuit = await prisma.circuit.findUnique({ where: { id: data.circuitId } });
    if (!circuit) {
      throw new Error('Circuit not found');
    }

    const summary = await circuitFinanceRepository.getFinancialSummary(data.circuitId);
    if (summary.currentBalance < data.amount) {
      throw new Error(
        `Insufficient circuit balance. Available: $${summary.currentBalance}, Requested: $${data.amount}`
      );
    }

    const expenditure = await circuitFinanceRepository.createExpenditure({
      id: uuidv4(),
      circuitId: data.circuitId,
      amount: data.amount,
      purpose: data.purpose,
      expenseCategory: data.expenseCategory,
      description: data.description || null,
      attachments: data.attachments || [],
      status: 'SUBMITTED',
      requestedBy: data.requestedBy,
      requestedAt: new Date(),
    });

    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        action: 'CIRCUIT_EXPENDITURE_REQUESTED',
        actorId: user.id,
        entityType: 'CIRCUIT_FINANCE',
        entityId: data.circuitId,
        churchId: user.churchId,
        changes: JSON.stringify({ expenditure }),
        timestamp: new Date(),
      },
    });

    return expenditure;
  }

  async listPendingExpenditures(circuitId: string, user: AuthorizedUser, options?: { skip?: number; take?: number }) {
    const circuit = await prisma.circuit.findUnique({ where: { id: circuitId } });
    if (!circuit) {
      throw new Error('Circuit not found');
    }

    if (!user.permissions.includes('circuit_expenditure:approve')) {
      throw new Error('Unauthorized: circuit_expenditure:approve permission required');
    }

    const { expenditures, total } = await circuitFinanceRepository.listPendingExpenditures(circuitId, options);

    return {
      circuitId,
      expenditures,
      total,
      skip: options?.skip ?? 0,
      take: options?.take ?? 20,
    };
  }

  async approveCircuitExpenditure(
    expenditureId: string,
    approved: boolean,
    approverNotes: string | undefined,
    user: AuthorizedUser,
    circuitId?: string
  ) {
    if (!user.permissions.includes('circuit_expenditure:approve')) {
      throw new Error('Unauthorized: circuit_expenditure:approve permission required');
    }

    const expenditure = await prisma.circuitExpenditure.findUnique({
      where: { id: expenditureId },
    });

    if (!expenditure) {
      throw new Error('Expenditure not found');
    }

    if (circuitId && expenditure.circuitId !== circuitId) {
      throw new Error('Expenditure does not belong to the provided circuit');
    }

    if (expenditure.status !== 'SUBMITTED') {
      throw new Error(`Cannot approve: expenditure status is ${expenditure.status}`);
    }

    const updated = await circuitFinanceRepository.updateExpenditure(expenditureId, {
      status: approved ? 'APPROVED' : 'REJECTED',
      approvedBy: user.id,
      approvedAt: new Date(),
      approverNotes: approverNotes || null,
    });

    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        action: approved ? 'CIRCUIT_EXPENDITURE_APPROVED' : 'CIRCUIT_EXPENDITURE_REJECTED',
        actorId: user.id,
        entityType: 'CIRCUIT_FINANCE',
        entityId: expenditure.circuitId,
        churchId: user.churchId,
        changes: JSON.stringify({ expenditureId, approved, approverNotes }),
        timestamp: new Date(),
      },
    });

    return updated;
  }

  async paymentCircuitExpenditure(
    expenditureId: string,
    paymentMethod: string,
    user: AuthorizedUser,
    circuitId?: string
  ) {
    if (!user.permissions.includes('circuit_payment:create')) {
      throw new Error('Unauthorized: circuit_payment:create permission required');
    }

    const expenditure = await prisma.circuitExpenditure.findUnique({ where: { id: expenditureId } });
    if (!expenditure) {
      throw new Error('Expenditure not found');
    }

    if (circuitId && expenditure.circuitId !== circuitId) {
      throw new Error('Expenditure does not belong to the provided circuit');
    }

    if (expenditure.status !== 'APPROVED') {
      throw new Error('Can only pay approved expenditures');
    }

    const updated = await circuitFinanceRepository.updateExpenditure(expenditureId, {
      status: 'PAID',
      paidAt: new Date(),
      paymentMethod,
    });

    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        action: 'CIRCUIT_EXPENDITURE_PAID',
        actorId: user.id,
        entityType: 'CIRCUIT_FINANCE',
        entityId: expenditure.circuitId,
        churchId: user.churchId,
        changes: JSON.stringify({ expenditureId, paymentMethod }),
        timestamp: new Date(),
      },
    });

    return updated;
  }
}

export const circuitFinanceService = new CircuitFinanceService();
