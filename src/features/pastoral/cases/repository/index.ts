// Pastoral Cases Repository - Database access layer

import { PrismaClient } from '@prisma/client';
import {
  CreatePastoralCaseDTO,
  UpdatePastoralCaseDTO,
  PastoralCaseResponse,
} from '../types';

const prisma = new PrismaClient();

export class PastoralCaseRepository {
  /**
   * Create a new pastoral case
   */
  async create(
    data: CreatePastoralCaseDTO & {
      churchId: string;
      openedBy: string;
    }
  ): Promise<PastoralCaseResponse> {
    const caseRecord = await prisma.pastoralCase.create({
      data: {
        churchId: data.churchId,
        memberId: data.memberId,
        category: data.category,
        concern: data.concern,
        priority: data.priority,
        assignedPastorId: data.assignedPastorId,
        openedBy: data.openedBy,
        openedAt: new Date(),
        targetFollowUpAt: data.targetFollowUpAt,
        status: 'OPEN',
      },
    });

    return this.formatResponse(caseRecord);
  }

  /**
   * Find case by ID
   */
  async findById(
    caseId: string,
    churchId: string
  ): Promise<PastoralCaseResponse | null> {
    const caseRecord = await prisma.pastoralCase.findUnique({
      where: { id: caseId },
      include: {
        member: true,
        assignedPastor: true,
        activities: true,
        followUps: true,
        referrals: true,
        visits: true,
        counselingSessions: true,
      },
    });

    if (!caseRecord || caseRecord.churchId !== churchId) {
      return null;
    }

    return this.formatResponse(caseRecord);
  }

  /**
   * List all cases for a church with filters
   */
  async listByChurch(
    churchId: string,
    filters?: {
      status?: string;
      priority?: string;
      memberId?: string;
      assignedPastorId?: string;
      skip?: number;
      take?: number;
    }
  ): Promise<{ cases: PastoralCaseResponse[]; total: number }> {
    const where: any = { churchId };

    if (filters?.status) where.status = filters.status;
    if (filters?.priority) where.priority = filters.priority;
    if (filters?.memberId) where.memberId = filters.memberId;
    if (filters?.assignedPastorId)
      where.assignedPastorId = filters.assignedPastorId;

    const [cases, total] = await Promise.all([
      prisma.pastoralCase.findMany({
        where,
        include: {
          member: true,
          assignedPastor: true,
          activities: { take: 5, orderBy: { createdAt: 'desc' } },
          followUps: { where: { status: 'PENDING' } },
        },
        orderBy: [{ priority: 'desc' }, { openedAt: 'desc' }],
        skip: filters?.skip || 0,
        take: filters?.take || 20,
      }),
      prisma.pastoralCase.count({ where }),
    ]);

    return {
      cases: cases.map((c) => this.formatResponse(c)),
      total,
    };
  }

  /**
   * Update case
   */
  async update(
    caseId: string,
    churchId: string,
    data: UpdatePastoralCaseDTO
  ): Promise<PastoralCaseResponse> {
    const existing = await prisma.pastoralCase.findUnique({
      where: { id: caseId },
    });

    if (!existing || existing.churchId !== churchId) {
      throw new Error('Case not found');
    }

    const updated = await prisma.pastoralCase.update({
      where: { id: caseId },
      data: {
        status: data.status,
        priority: data.priority,
        concern: data.concern,
        assignedPastorId: data.assignedPastorId,
        targetFollowUpAt: data.targetFollowUpAt,
        updatedAt: new Date(),
      },
      include: {
        member: true,
        assignedPastor: true,
      },
    });

    return this.formatResponse(updated);
  }

  /**
   * Close a case
   */
  async close(
    caseId: string,
    churchId: string,
    resolvedReason: string
  ): Promise<PastoralCaseResponse> {
    const existing = await prisma.pastoralCase.findUnique({
      where: { id: caseId },
    });

    if (!existing || existing.churchId !== churchId) {
      throw new Error('Case not found');
    }

    const closed = await prisma.pastoralCase.update({
      where: { id: caseId },
      data: {
        status: 'CLOSED',
        resolvedAt: new Date(),
        resolvedReason,
        closedAt: new Date(),
        updatedAt: new Date(),
      },
      include: {
        member: true,
      },
    });

    return this.formatResponse(closed);
  }

  /**
   * Add activity to case
   */
  async addActivity(
    caseId: string,
    churchId: string,
    data: {
      activityType: string;
      description: string;
      notes?: string;
      actorId: string;
      occurredAt: Date;
    }
  ): Promise<any> {
    const caseRecord = await prisma.pastoralCase.findUnique({
      where: { id: caseId },
    });

    if (!caseRecord || caseRecord.churchId !== churchId) {
      throw new Error('Case not found');
    }

    return prisma.pastoralCaseActivity.create({
      data: {
        caseId,
        activityType: data.activityType,
        description: data.description,
        notes: data.notes,
        actorId: data.actorId,
        occurredAt: data.occurredAt,
      },
    });
  }

  /**
   * Get case timeline (activities)
   */
  async getTimeline(
    caseId: string,
    churchId: string
  ): Promise<any[]> {
    const caseRecord = await prisma.pastoralCase.findUnique({
      where: { id: caseId },
    });

    if (!caseRecord || caseRecord.churchId !== churchId) {
      throw new Error('Case not found');
    }

    return prisma.pastoralCaseActivity.findMany({
      where: { caseId },
      orderBy: { occurredAt: 'desc' },
    });
  }

  /**
   * Count cases by status for a church
   */
  async countByStatus(churchId: string, status: string): Promise<number> {
    return prisma.pastoralCase.count({
      where: { churchId, status },
    });
  }

  /**
   * Count cases by priority for a church
   */
  async countByPriority(churchId: string, priority: string): Promise<number> {
    return prisma.pastoralCase.count({
      where: { churchId, priority },
    });
  }

  /**
   * Count cases by category
   */
  async countByCategory(
    churchId: string,
    category: string
  ): Promise<number> {
    return prisma.pastoralCase.count({
      where: { churchId, category },
    });
  }

  /**
   * Get high priority cases
   */
  async getHighPriority(churchId: string): Promise<PastoralCaseResponse[]> {
    const cases = await prisma.pastoralCase.findMany({
      where: {
        churchId,
        priority: { in: ['HIGH', 'URGENT'] },
        status: { not: 'CLOSED' },
      },
      include: {
        member: true,
        assignedPastor: true,
      },
      orderBy: { openedAt: 'desc' },
      take: 10,
    });

    return cases.map((c) => this.formatResponse(c));
  }

  /**
   * Get cases for member
   */
  async getByMember(
    memberId: string,
    churchId: string
  ): Promise<PastoralCaseResponse[]> {
    const cases = await prisma.pastoralCase.findMany({
      where: { memberId, churchId },
      include: {
        member: true,
        assignedPastor: true,
        followUps: { where: { status: 'PENDING' } },
      },
      orderBy: { openedAt: 'desc' },
    });

    return cases.map((c) => this.formatResponse(c));
  }

  /**
   * Get overdue follow-ups
   */
  async getOverdueFollowUps(
    churchId: string
  ): Promise<
    Array<{
      id: string;
      caseId: string;
      memberId: string;
      memberName: string;
      reason: string;
      dueDate: Date;
      isOverdue: boolean;
    }>
  > {
    const now = new Date();

    const followUps = await prisma.pastoralFollowUp.findMany({
      where: {
        churchId,
        status: 'PENDING',
        dueDate: { lt: now },
      },
      include: {
        member: true,
        case: true,
      },
      orderBy: { dueDate: 'asc' },
      take: 20,
    });

    return followUps.map((fu) => ({
      id: fu.id,
      caseId: fu.caseId,
      memberId: fu.memberId,
      memberName: `${fu.member.firstName} ${fu.member.lastName}`,
      reason: fu.reason,
      dueDate: fu.dueDate,
      isOverdue: true,
    }));
  }

  /**
   * Get cases by assigned pastor
   */
  async getByAssignedPastor(
    pastorId: string,
    churchId: string
  ): Promise<PastoralCaseResponse[]> {
    const cases = await prisma.pastoralCase.findMany({
      where: {
        churchId,
        assignedPastorId: pastorId,
        status: { not: 'CLOSED' },
      },
      include: {
        member: true,
        followUps: { where: { status: 'PENDING' } },
      },
      orderBy: { priority: 'desc' },
    });

    return cases.map((c) => this.formatResponse(c));
  }

  /**
   * Format case for response
   */
  private formatResponse(caseRecord: any): PastoralCaseResponse {
    return {
      id: caseRecord.id,
      churchId: caseRecord.churchId,
      memberId: caseRecord.memberId,
      category: caseRecord.category,
      concern: caseRecord.concern,
      priority: caseRecord.priority,
      status: caseRecord.status,
      assignedPastorId: caseRecord.assignedPastorId || undefined,
      openedAt: caseRecord.openedAt,
      openedBy: caseRecord.openedBy,
      targetFollowUpAt: caseRecord.targetFollowUpAt || undefined,
      resolvedAt: caseRecord.resolvedAt || undefined,
      resolvedReason: caseRecord.resolvedReason || undefined,
      closedAt: caseRecord.closedAt || undefined,
      activityCount: caseRecord.activities?.length || 0,
      createdAt: caseRecord.createdAt,
      updatedAt: caseRecord.updatedAt,
    };
  }
}

export const pastoralCaseRepository = new PastoralCaseRepository();
