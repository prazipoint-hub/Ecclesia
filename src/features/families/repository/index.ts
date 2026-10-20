import { prisma } from '@/database';
import { Family, FamilyRelationship, Prisma } from '@prisma/client';
import { AuthorizedUser } from '@/types';

export class FamilyRepository {
  /**
   * Find family by ID
   */
  async findById(id: string, user: AuthorizedUser): Promise<(Family & { members: any[] }) | null> {
    const family = await prisma.family.findUnique({
      where: { id },
      include: { members: true, church: true },
    });

    if (!family) return null;

    // Authorization: user must be from same church
    if (family.churchId !== user.churchId && !user.permissions.includes('family:view:all_churches')) {
      return null;
    }

    return family;
  }

  /**
   * List families by church
   */
  async listByChurch(
    churchId: string,
    user: AuthorizedUser,
    options?: { skip?: number; take?: number; sectionId?: string }
  ): Promise<{ families: Family[]; total: number }> {
    if (churchId !== user.churchId && !user.permissions.includes('family:view:all_churches')) {
      return { families: [], total: 0 };
    }

    const where: Prisma.FamilyWhereInput = { churchId };
    if (options?.sectionId) {
      where.sectionId = options.sectionId;
    }

    const [families, total] = await Promise.all([
      prisma.family.findMany({
        where,
        include: { members: true },
        skip: options?.skip,
        take: options?.take,
        orderBy: { name: 'asc' },
      }),
      prisma.family.count({ where }),
    ]);

    return { families, total };
  }

  /**
   * Create family
   */
  async create(data: Prisma.FamilyCreateInput): Promise<Family> {
    return prisma.family.create({ data });
  }

  /**
   * Add member to family
   */
  async addMember(
    familyId: string,
    memberId: string,
    relationshipType: string
  ): Promise<FamilyRelationship> {
    return prisma.familyRelationship.create({
      data: {
        familyId,
        memberId,
        relationshipType,
      },
    });
  }

  /**
   * Get family members
   */
  async getMembers(familyId: string): Promise<any[]> {
    const relationships = await prisma.familyRelationship.findMany({
      where: { familyId },
      include: { member: true },
    });

    return relationships.map((r) => ({
      member: r.member,
      relationshipType: r.relationshipType,
    }));
  }

  /**
   * Get families for member
   */
  async getForMember(memberId: string): Promise<Family[]> {
    const relationships = await prisma.familyRelationship.findMany({
      where: { memberId },
      include: { family: true },
    });

    return relationships.map((r) => r.family);
  }

  /**
   * Count families by church
   */
  async countByChurch(churchId: string): Promise<number> {
    return prisma.family.count({ where: { churchId } });
  }
}

export const familyRepository = new FamilyRepository();
