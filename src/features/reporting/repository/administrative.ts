import { prisma } from '@/database';

/**
 * ADMINISTRATIVE REPORTING REPOSITORY
 *
 * Aggregates membership, attendance, and demographic data for reports.
 */
export class AdministrativeReportRepository {
  /**
   * Get membership summary
   */
  async getMembershipSummary(
    churchId: string,
    organizationId?: string,
    sectionId?: string,
    membershipStatus?: string
  ) {
    const where: any = { churchId };

    if (organizationId) {
      // Count members in organization
      const memberships = await prisma.organizationMembership.count({
        where: {
          organizationId,
          membershipStatus: membershipStatus || 'ACTIVE',
        },
      });

      return {
        totalMembers: memberships,
        activeMembers: memberships,
        inactiveMembers: 0,
        scope: `Organization: ${organizationId}`,
      };
    }

    if (sectionId) {
      // Count members in section
      const members = await prisma.member.count({
        where: {
          sectionId,
          membershipStatus: membershipStatus || 'ACTIVE',
        },
      });

      return {
        totalMembers: members,
        activeMembers: members,
        inactiveMembers: 0,
        scope: `Section: ${sectionId}`,
      };
    }

    // Church-wide
    if (membershipStatus) {
      where.membershipStatus = membershipStatus;
    }

    const total = await prisma.member.count({ where });
    const active = await prisma.member.count({ where: { ...where, membershipStatus: 'ACTIVE' } });
    const inactive = await prisma.member.count({ where: { ...where, membershipStatus: 'INACTIVE' } });
    const deceased = await prisma.member.count({ where: { ...where, membershipStatus: 'DECEASED' } });

    return {
      totalMembers: total,
      activeMembers: active,
      inactiveMembers: inactive,
      deceased,
      transferredOut: 0,
      newThisPeriod: 0,
      scope: 'Church-wide',
    };
  }

  /**
   * Get membership details with demographics
   */
  async getMembershipDetails(
    churchId: string,
    organizationId?: string,
    sectionId?: string,
    membershipStatus?: string
  ) {
    const where: any = {};

    if (sectionId) {
      where.sectionId = sectionId;
    } else {
      where.churchId = churchId;
    }

    if (membershipStatus) {
      where.membershipStatus = membershipStatus;
    }

    const members = await prisma.member.findMany({
      where,
      include: {
        family: true,
        section: true,
        user: { select: { email: true, phone: true } },
      },
      orderBy: { surname: 'asc' },
    });

    if (organizationId) {
      // Filter to only those in the organization
      return members.filter((m) =>
        m.organizationMemberships?.some((om) => om.organizationId === organizationId)
      );
    }

    return members;
  }

  /**
   * Get attendance summary
   */
  async getAttendanceSummary(
    churchId: string,
    startDate: Date,
    endDate: Date,
    organizationId?: string,
    sectionId?: string
  ) {
    const eventWhere: any = {
      startDateTime: { gte: startDate, lte: endDate },
    };

    if (organizationId) {
      eventWhere.organizationId = organizationId;
    } else if (sectionId) {
      eventWhere.sectionId = sectionId;
    } else {
      eventWhere.churchId = churchId;
    }

    const events = await prisma.event.findMany({
      where: eventWhere,
      select: { id: true },
    });

    const eventIds = events.map((e) => e.id);

    const totalAttendances = await prisma.eventAttendance.count({
      where: {
        eventId: { in: eventIds },
        status: 'PRESENT',
      },
    });

    const totalEvents = events.length;
    const averageAttendancePerEvent = totalEvents > 0 ? totalAttendances / totalEvents : 0;

    return {
      totalEvents,
      totalAttendances,
      averageAttendancePerEvent: Math.round(averageAttendancePerEvent),
      attendanceRate: totalEvents > 0 ? (totalAttendances / (totalEvents * 30)) * 100 : 0, // Estimate
      scope: organizationId ? `Organization: ${organizationId}` : sectionId ? `Section: ${sectionId}` : 'Church-wide',
    };
  }

  /**
   * Get attendance details
   */
  async getAttendanceDetails(
    churchId: string,
    startDate: Date,
    endDate: Date,
    organizationId?: string,
    sectionId?: string
  ) {
    const eventWhere: any = {
      startDateTime: { gte: startDate, lte: endDate },
    };

    if (organizationId) {
      eventWhere.organizationId = organizationId;
    } else if (sectionId) {
      eventWhere.sectionId = sectionId;
    } else {
      eventWhere.churchId = churchId;
    }

    const attendances = await prisma.eventAttendance.findMany({
      where: {
        event: eventWhere,
      },
      include: {
        event: true,
        member: true,
      },
      orderBy: [{ event: { startDateTime: 'desc' } }, { member: { surname: 'asc' } }],
    });

    return attendances;
  }

  /**
   * Get leadership roster
   */
  async getLeadershipRoster(churchId: string, organizationId?: string, sectionId?: string) {
    if (organizationId) {
      return prisma.organizationRoleAssignment.findMany({
        where: {
          organizationId,
          endDate: null,
        },
        include: { member: true },
        orderBy: { position: 'asc' },
      });
    }

    if (sectionId) {
      return prisma.leadershipAssignment.findMany({
        where: {
          sectionId,
          endDate: null,
        },
        include: { member: true },
        orderBy: { position: 'asc' },
      });
    }

    // Church leadership
    return prisma.leadershipAssignment.findMany({
      where: {
        churchId,
        sectionId: null,
        endDate: null,
      },
      include: { member: true },
      orderBy: { position: 'asc' },
    });
  }

  /**
   * Get demographic summary
   */
  async getDemographicSummary(churchId: string, sectionId?: string) {
    const where: any = sectionId ? { sectionId } : { churchId };

    const [totalMembers, maleCount, femaleCount, averageAge] = await Promise.all([
      prisma.member.count({ where }),
      prisma.member.count({ where: { ...where, gender: 'MALE' } }),
      prisma.member.count({ where: { ...where, gender: 'FEMALE' } }),
      prisma.member.aggregate({
        where,
        _avg: { dateOfBirth: true },
      }),
    ]);

    return {
      totalMembers,
      maleCount,
      femaleCount,
      femalePercentage: totalMembers > 0 ? (femaleCount / totalMembers) * 100 : 0,
      malePercentage: totalMembers > 0 ? (maleCount / totalMembers) * 100 : 0,
      scope: sectionId ? `Section: ${sectionId}` : 'Church-wide',
    };
  }
}

export const administrativeReportRepository = new AdministrativeReportRepository();
