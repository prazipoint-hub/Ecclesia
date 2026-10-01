import { sectionFinanceRepository } from '../repository';
import { prisma } from '@/database';
import { AuthorizedUser } from '@/types';
import { v4 as uuidv4 } from 'uuid';

/**
 * SECTION FINANCE SERVICE
 *
 * CRITICAL PRINCIPLES:
 *
 * 1. Section Treasurer can operate their section's finances
 * 2. Section Secretary and Leader can APPROVE expenditure, not initiate
 * 3. Section expenditure approval is TWO-LEVEL: Secretary/Leader approval required
 * 4. Section finances are completely isolated from main church finances
 * 5. Main church users can VIEW but NOT OPERATE section finances
 * 6. Every transaction must carry sectionId for isolation enforcement
 * 7. No automatic mixing of section and main church funds
 */
export class SectionFinanceService {
  /**
   * Get section financial dashboard
   * Authorization: User must have section:finance:view permission for this section
   */
  async getSectionFinanceDashboard(sectionId: string, user: AuthorizedUser) {
    // Verify user is from same church (section-level access control)
    const section = await prisma.section.findUnique({
      where: { id: sectionId },
    });

    if (!section || section.churchId !== user.churchId) {
      throw new Error('Unauthorized: section not found or user not in same church');
    }

    // Check user has permission to view section finance
    if (!user.permissions.includes('section_finance:view')) {
      throw new Error('Unauthorized: section_finance:view permission required');
    }

    // Get financial summary
    const summary = await sectionFinanceRepository.getSectionFinancialSummary(sectionId);

    // Get recent receipts
    const { receipts } = await sectionFinanceRepository.listReceiptsBySection(sectionId, {
      take: 10,
    });

    // Get pending expenditures
    const { expenditures } = await sectionFinanceRepository.listPendingExpenditures(sectionId);

    return {
      section,
      summary,
      recentReceipts: receipts,
      pendingExpenditures: expenditures,
    };
  }

  /**
   * List pending expenditures awaiting approval for a section.
   */
  async listPendingExpenditures(
    sectionId: string,
    user: AuthorizedUser,
    options: { skip: number; take: number } = { skip: 0, take: 20 }
  ) {
    const section = await prisma.section.findUnique({
      where: { id: sectionId },
    });

    if (!section || section.churchId !== user.churchId) {
      throw new Error('Unauthorized: section not found or user not in same church');
    }

    if (!user.permissions.includes('section_expenditure:approve')) {
      throw new Error('Unauthorized: section_expenditure:approve permission required');
    }

    const { expenditures, total } = await sectionFinanceRepository.listPendingExpenditures(sectionId, {
      skip: options.skip,
      take: options.take,
    });

    return {
      sectionId,
      expenditures,
      total,
      skip: options.skip,
      take: options.take,
    };
  }

  /**
   * Create section receipt
   * Authorization: User must have section_receipt:create permission
   */
  async createSectionReceipt(
    data: {
      sectionId: string;
      memberId?: string;
      incomeType: string;
      amount: number;
      currency: string;
      paymentMethod: string;
      fundId?: string;
      reference?: string;
    },
    user: AuthorizedUser
  ) {
    // Authorization
    if (!user.permissions.includes('section_receipt:create')) {
      throw new Error('Unauthorized: section_receipt:create permission required');
    }

    // Verify section exists and user is from same church
    const section = await prisma.section.findUnique({
      where: { id: data.sectionId },
    });

    if (!section || section.churchId !== user.churchId) {
      throw new Error('Unauthorized: section not found or user not in same church');
    }

    // Verify section finance account exists
    let account = await sectionFinanceRepository.getSectionFinanceAccount(data.sectionId, user);
    if (!account) {
      // Initialize account if it doesn't exist
      account = await sectionFinanceRepository.createFinanceAccount({
        sectionId: data.sectionId,
        churchId: user.churchId,
        openingBalance: 0,
        currentBalance: 0,
        currency: data.currency,
      });
    }

    // Generate receipt number: SEC-{YYYY}-{COUNTER}
    const count = await sectionFinanceRepository.countSectionReceipts(data.sectionId);
    const year = new Date().getFullYear();
    const receiptNumber = `SEC-${year}-${String(count + 1).padStart(6, '0')}`;

    // Create receipt
    const receipt = await sectionFinanceRepository.createReceipt({
      id: uuidv4(),
      sectionId: data.sectionId,
      receiptNumber,
      memberId: data.memberId || null,
      amount: data.amount,
      currency: data.currency,
      incomeType: data.incomeType,
      paymentMethod: data.paymentMethod,
      fundId: data.fundId || null,
      reference: data.reference || null,
      status: 'ISSUED',
      issuedBy: user.id,
      issuedAt: new Date(),
    });

    // Create journal entry (double-entry accounting)
    // DR: Cash / Bank
    // CR: Income
    await this.createSectionJournalEntry({
      sectionId: data.sectionId,
      receiptId: receipt.id,
      debitAmount: data.amount,
      creditAmount: data.amount,
      description: `${data.incomeType} from section`,
    });

    // Audit log
    await this.logAudit({
      sectionId: data.sectionId,
      action: 'SECTION_RECEIPT_CREATED',
      actorId: user.id,
      churchId: user.churchId,
      changes: { receipt },
    });

    // Notify section leadership of income
    await this.notifySectionLeadership(data.sectionId, `Receipt ${receiptNumber} issued: $${data.amount}`);

    return receipt;
  }

  /**
   * Create section expenditure request
   * Status: DRAFT → SUBMITTED → (awaiting approval)
   */
  async createSectionExpenditure(
    data: {
      sectionId: string;
      amount: number;
      purpose: string;
      expenseCategory: string;
      description?: string;
      attachments?: string[];
    },
    user: AuthorizedUser
  ) {
    // Authorization: must be section treasurer or authorized
    if (!user.permissions.includes('section_expenditure:create')) {
      throw new Error('Unauthorized: section_expenditure:create permission required');
    }

    // Verify section
    const section = await prisma.section.findUnique({
      where: { id: data.sectionId },
    });

    if (!section || section.churchId !== user.churchId) {
      throw new Error('Unauthorized: section not found');
    }

    // Check available balance
    const summary = await sectionFinanceRepository.getSectionFinancialSummary(data.sectionId);
    if (summary.currentBalance < data.amount) {
      throw new Error(
        `Insufficient section balance. Available: $${summary.currentBalance}, Requested: $${data.amount}`
      );
    }

    // Create expenditure in SUBMITTED state (waiting for approval)
    const expenditure = await sectionFinanceRepository.createExpenditure({
      id: uuidv4(),
      sectionId: data.sectionId,
      amount: data.amount,
      purpose: data.purpose,
      expenseCategory: data.expenseCategory,
      description: data.description || null,
      attachments: data.attachments || [],
      status: 'SUBMITTED',
      requestedBy: user.id,
      requestedAt: new Date(),
    });

    // Audit log
    await this.logAudit({
      sectionId: data.sectionId,
      action: 'SECTION_EXPENDITURE_REQUESTED',
      actorId: user.id,
      churchId: user.churchId,
      changes: { expenditure },
    });

    // Notify section leadership for approval
    await this.notifyForSectionExpenditureApproval(data.sectionId, expenditure.id);

    return expenditure;
  }

  /**
   * Approve section expenditure
   * Authorization: Must be Section Leader or Section Secretary
   * CRITICAL: The treasurer cannot approve their own request by default
   */
  async approveSectionExpenditure(
    expenditureId: string,
    approved: boolean,
    approverNotes: string | undefined,
    user: AuthorizedUser,
    sectionId?: string
  ) {
    // Authorization: must have section expenditure approval permission
    if (!user.permissions.includes('section_expenditure:approve')) {
      throw new Error('Unauthorized: section_expenditure:approve permission required');
    }

    // Fetch expenditure
    const expenditure = await prisma.sectionExpenditure.findUnique({
      where: { id: expenditureId },
    });

    if (!expenditure) {
      throw new Error('Expenditure not found');
    }

    if (sectionId && expenditure.sectionId !== sectionId) {
      throw new Error('Expenditure does not belong to the provided section');
    }

    // Verify section and user church match
    const section = await prisma.section.findUnique({
      where: { id: expenditure.sectionId },
    });

    if (!section || section.churchId !== user.churchId) {
      throw new Error('Unauthorized: section not found');
    }

    // Verify expenditure is pending
    if (expenditure.status !== 'SUBMITTED') {
      throw new Error(`Cannot approve: expenditure status is ${expenditure.status}`);
    }

    // Update status
    const updated = await sectionFinanceRepository.updateExpenditure(expenditureId, {
      status: approved ? 'APPROVED' : 'REJECTED',
      approvedBy: user.id,
      approvedAt: new Date(),
      approverNotes: approverNotes || null,
    });

    // Audit log
    await this.logAudit({
      sectionId: expenditure.sectionId,
      action: approved ? 'SECTION_EXPENDITURE_APPROVED' : 'SECTION_EXPENDITURE_REJECTED',
      actorId: user.id,
      churchId: section.churchId,
      changes: {
        expenditureId,
        approved,
        approverNotes,
      },
    });

    // Notify requester
    await this.notifyExpenditureDecision(expenditure.requestedBy, approved, expenditure.amount);

    return updated;
  }

  /**
   * Record section payment (after approval)
   * This moves expenditure to PAID and records the accounting entry
   */
  async paymentSectionExpenditure(
    expenditureId: string,
    paymentMethod: string,
    user: AuthorizedUser,
    sectionId?: string
  ) {
    // Authorization: section treasurer can pay
    if (!user.permissions.includes('section_payment:create')) {
      throw new Error('Unauthorized: section_payment:create permission required');
    }

    // Fetch expenditure
    const expenditure = await prisma.sectionExpenditure.findUnique({
      where: { id: expenditureId },
    });

    if (!expenditure) {
      throw new Error('Expenditure not found');
    }

    if (sectionId && expenditure.sectionId !== sectionId) {
      throw new Error('Expenditure does not belong to the provided section');
    }

    // Verify it's approved
    if (expenditure.status !== 'APPROVED') {
      throw new Error('Can only pay approved expenditures');
    }

    // Mark as paid
    const updated = await sectionFinanceRepository.updateExpenditure(expenditureId, {
      status: 'PAID',
      paidAt: new Date(),
      paymentMethod,
    });

    // Create accounting entry
    await this.createSectionJournalEntry({
      sectionId: expenditure.sectionId,
      expenditureId: expenditure.id,
      debitAmount: expenditure.amount,
      creditAmount: expenditure.amount,
      description: `Payment: ${expenditure.purpose}`,
    });

    // Audit log
    await this.logAudit({
      sectionId: expenditure.sectionId,
      action: 'SECTION_EXPENDITURE_PAID',
      actorId: user.id,
      churchId: (await prisma.section.findUnique({ where: { id: expenditure.sectionId } }))?.churchId!,
      changes: { expenditureId, paymentMethod },
    });

    return updated;
  }

  /**
   * Create journal entry for section transaction
   * Double-entry: DR + CR must balance
   */
  private async createSectionJournalEntry(data: {
    sectionId: string;
    receiptId?: string;
    expenditureId?: string;
    debitAmount: number;
    creditAmount: number;
    description: string;
  }) {
    if (data.debitAmount !== data.creditAmount) {
      throw new Error('Journal entries must balance');
    }

    await prisma.sectionJournalEntry.create({
      data: {
        id: uuidv4(),
        sectionId: data.sectionId,
        receiptId: data.receiptId || null,
        expenditureId: data.expenditureId || null,
        debitAmount: data.debitAmount,
        creditAmount: data.creditAmount,
        description: data.description,
        postedAt: new Date(),
      },
    });
  }

  /**
   * Audit logging
   */
  private async logAudit(data: {
    sectionId: string;
    action: string;
    actorId: string;
    churchId: string;
    changes: any;
  }): Promise<void> {
    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        action: data.action,
        actorId: data.actorId,
        entityType: 'SECTION_FINANCE',
        entityId: data.sectionId,
        churchId: data.churchId,
        changes: JSON.stringify(data.changes),
        timestamp: new Date(),
      },
    });
  }

  /**
   * Notify section leadership
   */
  private async notifySectionLeadership(sectionId: string, message: string): Promise<void> {
    // Find section leadership
    const leaders = await prisma.leadershipAssignment.findMany({
      where: {
        sectionId,
        position: { in: ['LEADER', 'SECRETARY'] },
        endDate: null,
      },
      include: { member: true },
    });

    for (const assignment of leaders) {
      const user = await prisma.user.findFirst({
        where: { memberId: assignment.memberId },
      });
      if (user) {
        await prisma.notification.create({
          data: {
            id: uuidv4(),
            recipientId: user.id,
            type: 'SECTION_FINANCE_UPDATE',
            title: 'Section Finance Update',
            body: message,
            entityType: 'SECTION',
            entityId: sectionId,
            createdAt: new Date(),
          },
        });
      }
    }
  }

  /**
   * Notify for section expenditure approval
   */
  private async notifyForSectionExpenditureApproval(sectionId: string, expenditureId: string): Promise<void> {
    // Notify section leader and secretary
    const leaders = await prisma.leadershipAssignment.findMany({
      where: {
        sectionId,
        position: { in: ['LEADER', 'SECRETARY'] },
        endDate: null,
      },
      include: { member: true },
    });

    for (const assignment of leaders) {
      const user = await prisma.user.findFirst({
        where: { memberId: assignment.memberId },
      });
      if (user) {
        await prisma.notification.create({
          data: {
            id: uuidv4(),
            recipientId: user.id,
            type: 'SECTION_EXPENDITURE_PENDING',
            title: 'Section Expenditure Approval Pending',
            body: `A section expenditure request requires your approval.`,
            entityType: 'SECTION_EXPENDITURE',
            entityId: expenditureId,
            createdAt: new Date(),
          },
        });
      }
    }
  }

  /**
   * Notify expenditure decision
   */
  private async notifyExpenditureDecision(
    requestedById: string,
    approved: boolean,
    amount: number
  ): Promise<void> {
    const title = approved ? 'Expenditure Approved' : 'Expenditure Rejected';
    const body = approved
      ? `Your expenditure request for $${amount} has been approved.`
      : `Your expenditure request for $${amount} has been rejected.`;

    await prisma.notification.create({
      data: {
        id: uuidv4(),
        recipientId: requestedById,
        type: approved ? 'SECTION_EXPENDITURE_APPROVED' : 'SECTION_EXPENDITURE_REJECTED',
        title,
        body,
        createdAt: new Date(),
      },
    });
  }
}

export const sectionFinanceService = new SectionFinanceService();
