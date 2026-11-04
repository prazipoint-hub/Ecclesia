import { prisma } from '@/database';

/**
 * AUDIT REPORTING REPOSITORY
 *
 * Provides access to audit trails and exception reports.
 */
export class AuditReportRepository {
  /**
   * Get audit trail
   */
  async getAuditTrail(
    churchId: string,
    startDate: Date,
    endDate: Date,
    entityType?: string,
    entityId?: string,
    action?: string
  ) {
    const where: any = {
      churchId,
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (action) where.action = action;

    return prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: 1000,
    });
  }

  /**
   * Get exception report
   * Identifies data quality issues and anomalies
   */
  async getExceptionReport(churchId: string, _startDate: Date, _endDate: Date) {
    const exceptions: any[] = [];

    // The unique database constraint should prevent these. Keeping the check
    // makes the report useful for legacy/imported data without reading other
    // churches' records.
    const duplicates = await prisma.organizationMembership.groupBy({
      by: ['memberId', 'organizationId'],
      where: { membershipStatus: 'ACTIVE', member: { churchId } },
      _count: { _all: true },
      having: { id: { _count: { gt: 1 } } },
    });

    if ((duplicates as any[]).length > 0) {
      exceptions.push({
        type: 'DUPLICATE_MEMBERSHIP',
        severity: 'HIGH',
        description: 'Members with duplicate active organizational memberships',
        count: (duplicates as any[]).length,
        details: duplicates,
      });
    }

    // Find members with no section assignment
    const unassignedMembers = await prisma.member.count({
      where: {
        churchId,
        sectionId: null,
        membershipStatus: 'ACTIVE',
      },
    });

    if (unassignedMembers > 0) {
      exceptions.push({
        type: 'UNASSIGNED_MEMBERS',
        severity: 'MEDIUM',
        description: 'Active members with no section assignment',
        count: unassignedMembers,
      });
    }

    // Find youth members aged 18 or more. Prisma queries keep this scoped to
    // the requesting church and resilient to generated table-name changes.
    const ageLimit = new Date();
    ageLimit.setFullYear(ageLimit.getFullYear() - 18);
    const agedOutMembers = await prisma.organizationMembership.findMany({
      where: {
        membershipStatus: 'ACTIVE',
        organization: { churchId, organizationType: 'UMYF' },
        member: { churchId, dateOfBirth: { lte: ageLimit } },
      },
      select: {
        member: { select: { id: true, firstName: true, lastName: true, dateOfBirth: true } },
        organization: { select: { id: true, name: true } },
      },
      take: 50,
    });

    if ((agedOutMembers as any[]).length > 0) {
      exceptions.push({
        type: 'AGED_OUT_YOUTH_MEMBERS',
        severity: 'MEDIUM',
        description: 'Youth members who have aged out of UMYF',
        count: (agedOutMembers as any[]).length,
        details: agedOutMembers,
      });
    }

    const orgsWithoutTreasurer = await prisma.organization.findMany({
      where: {
        churchId,
        status: 'ACTIVE',
        roles: { none: { position: 'Treasurer', endDate: null } },
      },
      select: { id: true, name: true },
    });

    if ((orgsWithoutTreasurer as any[]).length > 0) {
      exceptions.push({
        type: 'MISSING_TREASURER',
        severity: 'HIGH',
        description: 'Organizations without active treasurers',
        count: (orgsWithoutTreasurer as any[]).length,
        details: orgsWithoutTreasurer,
      });
    }

    return exceptions;
  }
}

export const auditReportRepository = new AuditReportRepository();
