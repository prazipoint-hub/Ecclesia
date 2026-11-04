import { memberRepository } from '../repository';
import { Member } from '@prisma/client';
import { AuthorizedUser } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/database';

export class MemberService {
  /**
   * Get member by ID
   */
  async getMember(id: string, user: AuthorizedUser): Promise<Member | null> {
    return memberRepository.findById(id, user);
  }

  /**
   * List members for church
   */
  async listMembers(
    churchId: string,
    user: AuthorizedUser,
    options?: { skip?: number; take?: number; sectionId?: string }
  ) {
    return memberRepository.listByChurch(churchId, user, options);
  }

  /**
   * Create new member
   * Authorization: user must have member:create permission in their church
   */
  async createMember(
    data: {
      firstName: string;
      middleName?: string;
      lastName: string;
      gender: 'MALE' | 'FEMALE' | 'OTHER';
      dateOfBirth?: Date;
      phone?: string;
      email?: string;
      address?: string;
      churchId: string;
      sectionId?: string;
      membershipStatus?: string;
      membershipDate?: Date;
      isDependent?: boolean;
      parentMemberId?: string;
    },
    user: AuthorizedUser
  ): Promise<Member> {
    // Authorization checks
    if (!user.permissions.includes('member:create')) {
      throw new Error('Unauthorized: member:create permission required');
    }

    if (data.churchId !== user.churchId && !user.permissions.includes('member:create:all_churches')) {
      throw new Error('Unauthorized: cannot create member in another church');
    }

    // Generate unique membership number
    const membershipNumber = await this.generateMembershipNumber(data.churchId);

    const member = await memberRepository.create({
      id: uuidv4(),
      firstName: data.firstName,
      middleName: data.middleName || null,
      lastName: data.lastName,
      gender: data.gender,
      dateOfBirth: data.dateOfBirth || null,
      phone: data.phone || null,
      email: data.email || null,
      address: data.address || null,
      membershipNumber,
      churchId: data.churchId,
      sectionId: data.sectionId || null,
      membershipStatus: data.membershipStatus || 'ACTIVE',
      membershipDate: data.membershipDate || new Date(),
      isDependent: data.isDependent || false,
      parentMemberId: data.parentMemberId || null,
    });

    // Audit log
    await this.logAudit({
      memberId: member.id,
      action: 'MEMBER_CREATED',
      actorId: user.id,
      churchId: data.churchId,
      changes: { created: member },
    });

    return member;
  }

  /**
   * Update member
   * Authorization: user must have member:update permission
   */
  async updateMember(
    id: string,
    updates: Partial<{
      firstName: string;
      middleName?: string;
      lastName: string;
      gender: string;
      phone?: string;
      email?: string;
      address?: string;
      sectionId?: string;
    }>,
    user: AuthorizedUser
  ): Promise<Member> {
    if (!user.permissions.includes('member:update')) {
      throw new Error('Unauthorized: member:update permission required');
    }

    // Fetch existing member
    const member = await memberRepository.findById(id, user);
    if (!member) {
      throw new Error('Member not found');
    }

    // Perform update
    const updated = await memberRepository.update(id, updates);

    // Audit log
    await this.logAudit({
      memberId: id,
      action: 'MEMBER_UPDATED',
      actorId: user.id,
      churchId: member.churchId,
      changes: { before: member, after: updated },
    });

    return updated;
  }

  /**
   * Add dependent (child under 12)
   */
  async addDependent(
    parentMemberId: string,
    data: {
      firstName: string;
      lastName: string;
      gender: 'MALE' | 'FEMALE' | 'OTHER';
      dateOfBirth: Date;
    },
    user: AuthorizedUser
  ): Promise<Member> {
    if (!user.permissions.includes('member:create')) {
      throw new Error('Unauthorized: member:create permission required');
    }

    // Fetch parent
    const parent = await memberRepository.findById(parentMemberId, user);
    if (!parent) {
      throw new Error('Parent member not found');
    }

    // Create dependent
    const dependent = await memberRepository.create({
      id: uuidv4(),
      firstName: data.firstName,
      lastName: data.lastName,
      gender: data.gender,
      dateOfBirth: data.dateOfBirth,
      membershipNumber: await this.generateMembershipNumber(parent.churchId),
      churchId: parent.churchId,
      sectionId: parent.sectionId,
      isDependent: true,
      parentMemberId: parent.id,
      membershipStatus: 'ACTIVE',
      membershipDate: new Date(),
    });

    // Audit log
    await this.logAudit({
      memberId: dependent.id,
      action: 'DEPENDENT_CREATED',
      actorId: user.id,
      churchId: parent.churchId,
      changes: { parentId: parent.id, created: dependent },
    });

    return dependent;
  }

  /**
   * Get member's dependants
   */
  async getDependants(parentMemberId: string, user: AuthorizedUser): Promise<Member[]> {
    const parent = await memberRepository.findById(parentMemberId, user);
    if (!parent) {
      throw new Error('Parent member not found');
    }

    return memberRepository.getDependants(parentMemberId);
  }

  /**
   * Get church statistics
   */
  async getChurchStatistics(churchId: string, user: AuthorizedUser) {
    if (churchId !== user.churchId && !user.permissions.includes('statistics:view:all_churches')) {
      throw new Error('Unauthorized: cannot view statistics for another church');
    }

    return memberRepository.getChurchStatistics(churchId);
  }

  /**
   * Generate unique membership number for church
   */
  private async generateMembershipNumber(churchId: string): Promise<string> {
    const count = await prisma.member.count({ where: { churchId } });
    // Format: M{YYYY}{COUNTER} e.g., M202501001
    const year = new Date().getFullYear();
    const counter = String(count + 1).padStart(3, '0');
    return `M${year}${counter}`;
  }

  /**
   * Log audit event
   */
  private async logAudit(data: {
    memberId: string;
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
        entityType: 'MEMBER',
        entityId: data.memberId,
        churchId: data.churchId,
        changes: JSON.stringify(data.changes),
        timestamp: new Date(),
      },
    });
  }
}

export const memberService = new MemberService();
