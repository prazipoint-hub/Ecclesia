import { sectionRepository } from '../repository';
import { Section } from '@prisma/client';
import { AuthorizedUser } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/database';

export class SectionService {
  /**
   * Get section by ID
   */
  async getSection(id: string, user: AuthorizedUser): Promise<Section | null> {
    return sectionRepository.findById(id, user);
  }

  /**
   * List sections for church
   */
  async listSections(
    churchId: string,
    user: AuthorizedUser,
    options?: { skip?: number; take?: number }
  ) {
    return sectionRepository.listByChurch(churchId, user, options);
  }

  /**
   * Create section
   */
  async createSection(
    data: {
      name: string;
      churchId: string;
      code?: string;
    },
    user: AuthorizedUser
  ): Promise<Section> {
    if (!user.permissions.includes('section:create')) {
      throw new Error('Unauthorized: section:create permission required');
    }

    if (data.churchId !== user.churchId && !user.permissions.includes('section:create:all_churches')) {
      throw new Error('Unauthorized: cannot create section in another church');
    }

    const section = await sectionRepository.create({
      id: uuidv4(),
      name: data.name,
      churchId: data.churchId,
      code: data.code || null,
    });

    // Audit log
    await this.logAudit({
      sectionId: section.id,
      action: 'SECTION_CREATED',
      actorId: user.id,
      churchId: data.churchId,
      changes: { created: section },
    });

    return section;
  }

  /**
   * Assign section leadership
   * Critical: Establishes section leader, vice leader, secretary, treasurer
   */
  async assignLeadership(
    data: {
      sectionId: string;
      memberId: string;
      position: 'LEADER' | 'VICE_LEADER' | 'SECRETARY' | 'TREASURER';
      effectiveDate?: Date;
    },
    user: AuthorizedUser
  ) {
    if (!user.permissions.includes('section:manage')) {
      throw new Error('Unauthorized: section:manage permission required');
    }

    // Verify section exists and user can access
    const section = await sectionRepository.findById(data.sectionId, user);
    if (!section) {
      throw new Error('Section not found');
    }

    // Verify member exists and is in this church
    const member = await prisma.member.findUnique({
      where: { id: data.memberId },
    });
    if (!member || member.churchId !== section.churchId) {
      throw new Error('Member not found in this church');
    }

    // End any existing assignment with this position in this section
    await prisma.leadershipAssignment.updateMany({
      where: {
        sectionId: data.sectionId,
        position: data.position,
        endDate: null,
      },
      data: {
        endDate: new Date(),
      },
    });

    // Create new assignment
    const assignment = await prisma.leadershipAssignment.create({
      data: {
        id: uuidv4(),
        memberId: data.memberId,
        sectionId: data.sectionId,
        position: data.position,
        startDate: data.effectiveDate || new Date(),
        endDate: null,
      },
    });

    // Audit log
    await this.logAudit({
      sectionId: data.sectionId,
      action: 'SECTION_LEADERSHIP_ASSIGNED',
      actorId: user.id,
      churchId: section.churchId,
      changes: {
        memberId: data.memberId,
        position: data.position,
      },
    });

    return assignment;
  }

  /**
   * Get section members
   */
  async getSectionMembers(sectionId: string, user: AuthorizedUser) {
    const section = await sectionRepository.findById(sectionId, user);
    if (!section) {
      throw new Error('Section not found');
    }

    return prisma.member.findMany({
      where: { sectionId },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  /**
   * Get section leadership
   */
  async getSectionLeadership(sectionId: string, user: AuthorizedUser) {
    const section = await sectionRepository.findById(sectionId, user);
    if (!section) {
      throw new Error('Section not found');
    }

    return sectionRepository.getLeadership(sectionId);
  }

  /**
   * Log audit event
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
        entityType: 'SECTION',
        entityId: data.sectionId,
        churchId: data.churchId,
        changes: JSON.stringify(data.changes),
        timestamp: new Date(),
      },
    });
  }
}

export const sectionService = new SectionService();
