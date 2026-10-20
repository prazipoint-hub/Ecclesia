import { prisma } from '@/database';
import { Member, Prisma } from '@prisma/client';
import { AuthorizedUser } from '@/types';

export class MemberRepository {
  /**
   * Find member by ID with authorization check
   */
  async findById(id: string, user: AuthorizedUser): Promise<Member | null> {
    // Ensure user can view this member within their church scope
    const member = await prisma.member.findUnique({
      where: { id },
      include: { church: true },
    });

    if (!member) return null;

    // User must be from same church or have cross-church view permission
    if (member.churchId !== user.churchId && !user.permissions.includes('member:view:all_churches')) {
      return null;
    }

    return member;
  }

  /**
   * List members by church with authorization
   */
  async listByChurch(
    churchId: string,
    user: AuthorizedUser,
    options?: { skip?: number; take?: number; sectionId?: string }
  ): Promise<{ members: Member[]; total: number }> {
    // Authorization: user must be in same church or have cross-church permission
    if (churchId !== user.churchId && !user.permissions.includes('member:view:all_churches')) {
      return { members: [], total: 0 };
    }

    const where: Prisma.MemberWhereInput = { churchId };
    if (options?.sectionId) {
      where.sectionId = options.sectionId;
    }

    const [members, total] = await Promise.all([
      prisma.member.findMany({
        where,
        skip: options?.skip,
        take: options?.take,
        orderBy: { lastName: 'asc' },
      }),
      prisma.member.count({ where }),
    ]);

    return { members, total };
  }

  /**
   * Create new member
   */
  async create(data: Prisma.MemberCreateInput): Promise<Member> {
    return prisma.member.create({ data });
  }

  /**
   * Update member
   */
  async update(id: string, data: Prisma.MemberUpdateInput): Promise<Member> {
    return prisma.member.update({
      where: { id },
      data,
    });
  }

  /**
   * Find member by membership number within church
   */
  async findByMembershipNumber(membershipNumber: string, churchId: string): Promise<Member | null> {
    return prisma.member.findFirst({
      where: { membershipNumber, churchId },
    });
  }

  /**
   * Get member with family relationships
   */
  async findWithFamily(id: string): Promise<
    Member & { familyRelationships: any[]; parentMember: Member | null }
  > {
    return prisma.member.findUniqueOrThrow({
      where: { id },
      include: {
        familyRelationships: true,
        parentMember: true,
      },
    });
  }

  /**
   * Get member's dependants (children under 12)
   */
  async getDependants(parentMemberId: string): Promise<Member[]> {
    return prisma.member.findMany({
      where: {
        parentMemberId,
        isDependent: true,
      },
      orderBy: { dateOfBirth: 'desc' },
    });
  }

  /**
   * Get members by section
   */
  async findBySection(sectionId: string): Promise<Member[]> {
    return prisma.member.findMany({
      where: { sectionId },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  /**
   * Count members by status in church
   */
  async countByStatus(
    churchId: string,
    status: string
  ): Promise<number> {
    return prisma.member.count({
      where: { churchId, membershipStatus: status },
    });
  }

  /**
   * Get member statistics for church
   */
  async getChurchStatistics(churchId: string): Promise<{
    total: number;
    active: number;
    inactive: number;
    transferred: number;
    deceased: number;
    male: number;
    female: number;
    children: number;
  }> {
    const [total, active, inactive, transferred, deceased, male, female, children] = await Promise.all([
      prisma.member.count({ where: { churchId } }),
      prisma.member.count({ where: { churchId, membershipStatus: 'ACTIVE' } }),
      prisma.member.count({ where: { churchId, membershipStatus: 'INACTIVE' } }),
      prisma.member.count({ where: { churchId, membershipStatus: 'TRANSFERRED' } }),
      prisma.member.count({ where: { churchId, membershipStatus: 'DECEASED' } }),
      prisma.member.count({ where: { churchId, gender: 'MALE' } }),
      prisma.member.count({ where: { churchId, gender: 'FEMALE' } }),
      prisma.member.count({ where: { churchId, isDependent: true } }),
    ]);

    return { total, active, inactive, transferred, deceased, male, female, children };
  }
}

export const memberRepository = new MemberRepository();
