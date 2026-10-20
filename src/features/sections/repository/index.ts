import { prisma } from '@/database';
import { Section, Prisma } from '@prisma/client';
import { AuthorizedUser } from '@/types';

export class SectionRepository {
  /**
   * Find section by ID
   */
  async findById(id: string, user: AuthorizedUser): Promise<Section | null> {
    const section = await prisma.section.findUnique({
      where: { id },
    });

    if (!section) return null;

    // Authorization: user must be from same church
    if (section.churchId !== user.churchId && !user.permissions.includes('section:view:all_churches')) {
      return null;
    }

    return section;
  }

  /**
   * List sections by church
   */
  async listByChurch(
    churchId: string,
    user: AuthorizedUser,
    options?: { skip?: number; take?: number }
  ): Promise<{ sections: Section[]; total: number }> {
    if (churchId !== user.churchId && !user.permissions.includes('section:view:all_churches')) {
      return { sections: [], total: 0 };
    }

    const [sections, total] = await Promise.all([
      prisma.section.findMany({
        where: { churchId },
        skip: options?.skip,
        take: options?.take,
        orderBy: { name: 'asc' },
      }),
      prisma.section.count({ where: { churchId } }),
    ]);

    return { sections, total };
  }

  /**
   * Create section
   */
  async create(data: Prisma.SectionCreateInput): Promise<Section> {
    return prisma.section.create({ data });
  }

  /**
   * Update section
   */
  async update(id: string, data: Prisma.SectionUpdateInput): Promise<Section> {
    return prisma.section.update({
      where: { id },
      data,
    });
  }

  /**
   * Get section with members
   */
  async findWithMembers(id: string): Promise<
    Section & { members: any[] }
  > {
    return prisma.section.findUniqueOrThrow({
      where: { id },
      include: {
        members: true,
      },
    });
  }

  /**
   * Get section members count
   */
  async getMembersCount(sectionId: string): Promise<number> {
    return prisma.member.count({
      where: { sectionId },
    });
  }

  /**
   * Get section leadership
   */
  async getLeadership(sectionId: string): Promise<any[]> {
    return prisma.leadershipAssignment.findMany({
      where: {
        sectionId,
        endDate: null,
      },
      include: {
        member: true,
      },
      orderBy: { position: 'asc' },
    });
  }
}

export const sectionRepository = new SectionRepository();
