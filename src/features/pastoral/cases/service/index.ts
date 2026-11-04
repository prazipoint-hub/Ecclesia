import { prisma } from '@/database';
import { AuthorizedUser } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import {
  AddCaseActivityDTO,
  CreatePastoralCaseDTO,
  UpdatePastoralCaseDTO,
} from '../../types';
import { pastoralCaseRepository } from '../repository';

type CaseFilters = {
  status?: string;
  priority?: string;
  memberId?: string;
  assignedPastorId?: string;
  skip?: number;
  take?: number;
};

export class PastoralCaseService {
  async list(filters: CaseFilters, user: AuthorizedUser) {
    this.requirePermission(user, 'pastoral:case:view');
    return pastoralCaseRepository.listByChurch(user.churchId, filters);
  }

  async get(caseId: string, user: AuthorizedUser) {
    this.requirePermission(user, 'pastoral:case:view');
    const pastoralCase = await pastoralCaseRepository.findById(caseId, user.churchId);
    if (!pastoralCase) throw new Error('Pastoral case not found');
    return pastoralCase;
  }

  async create(data: CreatePastoralCaseDTO, user: AuthorizedUser) {
    this.requirePermission(user, 'pastoral:case:create');
    const actorId = this.requirePastoralActor(user);
    await this.assertMemberInChurch(data.memberId, user.churchId, 'Member');
    if (data.assignedPastorId) {
      await this.assertMemberInChurch(data.assignedPastorId, user.churchId, 'Assigned pastor');
    }

    const pastoralCase = await pastoralCaseRepository.create({
      ...data,
      churchId: user.churchId,
      openedBy: actorId,
    });
    await this.logAudit({
      caseId: pastoralCase.id,
      churchId: user.churchId,
      actorId,
      action: 'PASTORAL_CASE_OPENED',
      changes: {
        memberId: pastoralCase.memberId,
        category: pastoralCase.category,
        priority: pastoralCase.priority,
        assignedPastorId: pastoralCase.assignedPastorId,
      },
    });
    return pastoralCase;
  }

  async update(caseId: string, data: UpdatePastoralCaseDTO, user: AuthorizedUser) {
    this.requirePermission(user, 'pastoral:case:update');
    const actorId = this.requirePastoralActor(user);
    const existing = await this.getForMutation(caseId, user);
    if (existing.status === 'CLOSED') {
      throw new Error('Invalid: a closed pastoral case cannot be updated');
    }
    if (data.assignedPastorId) {
      await this.assertMemberInChurch(data.assignedPastorId, user.churchId, 'Assigned pastor');
    }

    const pastoralCase = await pastoralCaseRepository.update(caseId, user.churchId, data);
    await this.logAudit({
      caseId,
      churchId: user.churchId,
      actorId,
      action: 'PASTORAL_CASE_UPDATED',
      changes: {
        status: data.status,
        priority: data.priority,
        assignedPastorId: data.assignedPastorId,
        targetFollowUpAt: data.targetFollowUpAt?.toISOString(),
      },
    });
    return pastoralCase;
  }

  async close(caseId: string, resolvedReason: string, user: AuthorizedUser) {
    this.requirePermission(user, 'pastoral:case:close');
    const actorId = this.requirePastoralActor(user);
    const existing = await this.getForMutation(caseId, user);
    if (existing.status === 'CLOSED') {
      throw new Error('Invalid: pastoral case is already closed');
    }

    const pastoralCase = await pastoralCaseRepository.close(caseId, user.churchId, resolvedReason);
    await this.logAudit({
      caseId,
      churchId: user.churchId,
      actorId,
      action: 'PASTORAL_CASE_CLOSED',
      changes: { previousStatus: existing.status, status: 'CLOSED' },
    });
    return pastoralCase;
  }

  async addActivity(caseId: string, data: AddCaseActivityDTO, user: AuthorizedUser) {
    this.requirePermission(user, 'pastoral:case:update');
    const actorId = this.requirePastoralActor(user);
    const existing = await this.getForMutation(caseId, user);
    if (existing.status === 'CLOSED') {
      throw new Error('Invalid: a closed pastoral case cannot receive new activity');
    }

    const activity = await pastoralCaseRepository.addActivity(caseId, user.churchId, {
      ...data,
      actorId,
    });
    await this.logAudit({
      caseId,
      churchId: user.churchId,
      actorId,
      action: 'PASTORAL_CASE_ACTIVITY_ADDED',
      changes: { activityType: data.activityType, activityId: activity.id },
    });
    return activity;
  }

  async timeline(caseId: string, user: AuthorizedUser) {
    this.requirePermission(user, 'pastoral:case:view');
    await this.get(caseId, user);
    return pastoralCaseRepository.getTimeline(caseId, user.churchId);
  }

  private requirePermission(user: AuthorizedUser, permission: string): void {
    if (!user.permissions.includes(permission)) {
      throw new Error(`Forbidden: ${permission} permission required`);
    }
  }

  private requirePastoralActor(user: AuthorizedUser): string {
    if (!user.memberId) {
      throw new Error('Invalid: a member-linked account is required for pastoral case work');
    }
    return user.memberId;
  }

  private async assertMemberInChurch(memberId: string, churchId: string, label: string): Promise<void> {
    const member = await prisma.member.findFirst({ where: { id: memberId, churchId }, select: { id: true } });
    if (!member) throw new Error(`${label} not found in this church`);
  }

  private async getForMutation(caseId: string, user: AuthorizedUser) {
    const pastoralCase = await pastoralCaseRepository.findById(caseId, user.churchId);
    if (!pastoralCase) throw new Error('Pastoral case not found');
    return pastoralCase;
  }

  private async logAudit(data: {
    caseId: string;
    churchId: string;
    actorId: string;
    action: string;
    changes: Record<string, unknown>;
  }): Promise<void> {
    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        churchId: data.churchId,
        action: data.action,
        entityType: 'PASTORAL_CASE',
        entityId: data.caseId,
        actorId: data.actorId,
        changes: JSON.stringify(data.changes),
        timestamp: new Date(),
      },
    });
  }
}

export const pastoralCaseService = new PastoralCaseService();
