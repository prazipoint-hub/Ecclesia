import { familyRepository } from '../repository';
import { Family } from '@prisma/client';
import { AuthorizedUser } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/database';

export class FamilyService {
  /**
   * Get family by ID
   */
  async getFamily(id: string, user: AuthorizedUser) {
    return familyRepository.findById(id, user);
  }

  /**
   * List families for church
   */
  async listFamilies(
    churchId: string,
    user: AuthorizedUser,
    options?: { skip?: number; take?: number; sectionId?: string }
  ) {
    return familyRepository.listByChurch(churchId, user, options);
  }

  /**
   * Create family
   */
  async createFamily(
    data: {
      name: string;
      churchId: string;
      sectionId?: string;
      headOfFamilyId?: string;
    },
    user: AuthorizedUser
  ): Promise<Family> {
    if (!user.permissions.includes('family:create')) {
      throw new Error('Unauthorized: family:create permission required');
    }

    if (data.churchId !== user.churchId && !user.permissions.includes('family:create:all_churches')) {
      throw new Error('Unauthorized: cannot create family in another church');
    }

    const family = await familyRepository.create({
      id: uuidv4(),
      name: data.name,
      churchId: data.churchId,
      sectionId: data.sectionId || null,
      headOfFamilyId: data.headOfFamilyId || null,
    });

    // Audit log
    await this.logAudit({
      familyId: family.id,
      action: 'FAMILY_CREATED',
      actorId: user.id,
      churchId: data.churchId,
      changes: { created: family },
    });

    return family;
  }

  /**
   * Add member to family
   */
  async addMemberToFamily(
    familyId: string,
    memberId: string,
    relationshipType: string,
    user: AuthorizedUser
  ) {
    if (!user.permissions.includes('family:update')) {
      throw new Error('Unauthorized: family:update permission required');
    }

    // Verify family exists and user can access
    const family = await familyRepository.findById(familyId, user);
    if (!family) {
      throw new Error('Family not found');
    }

    const relationship = await familyRepository.addMember(familyId, memberId, relationshipType);

    // Audit log
    await this.logAudit({
      familyId,
      action: 'FAMILY_MEMBER_ADDED',
      actorId: user.id,
      churchId: family.churchId,
      changes: { memberId, relationshipType },
    });

    return relationship;
  }

  /**
   * Get family members with relationships
   */
  async getFamilyMembers(familyId: string, user: AuthorizedUser) {
    const family = await familyRepository.findById(familyId, user);
    if (!family) {
      throw new Error('Family not found');
    }

    return familyRepository.getMembers(familyId);
  }

  /**
   * Get families for member
   */
  async getMemberFamilies(memberId: string, user: AuthorizedUser) {
    // Verify user can access this member
    const memberSvc = await prisma.member.findUnique({
      where: { id: memberId },
      select: { churchId: true },
    });

    if (!memberSvc) {
      throw new Error('Member not found');
    }

    if (memberSvc.churchId !== user.churchId && !user.permissions.includes('family:view:all_churches')) {
      throw new Error('Unauthorized: cannot view member families');
    }

    return familyRepository.getForMember(memberId);
  }

  /**
   * Log audit event
   */
  private async logAudit(data: {
    familyId: string;
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
        entityType: 'FAMILY',
        entityId: data.familyId,
        churchId: data.churchId,
        changes: JSON.stringify(data.changes),
        timestamp: new Date(),
      },
    });
  }
}

export const familyService = new FamilyService();
