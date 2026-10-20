import { prisma } from '@/database';
import { AuthorizedUser } from '@/types';

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
      include: { actor: { select: { email: true, member: { select: { surname: true } } } } },
      orderBy: { timestamp: 'desc' },
      take: 1000,
    });
  }

  /**
   * Get exception report
   * Identifies data quality issues and anomalies
   */
  async getExceptionReport(churchId: string, startDate: Date, endDate: Date) {
    const exceptions: any[] = [];

    // Find duplicate organization memberships
    const duplicates = await prisma.$queryRaw`
      SELECT member_id, organization_id, COUNT(*) as count
      FROM organization_membership
      WHERE membership_status = 'ACTIVE'
      GROUP BY member_id, organization_id
      HAVING COUNT(*) > 1
    `;

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

    // Find aged-out organization members
    const agedOutMembers = await prisma.$queryRaw`
      SELECT m.id, m.surname, m.given_names, m.date_of_birth
      FROM member m
      JOIN organization_membership om ON m.id = om.member_id
      WHERE YEAR(FROM_DAYS(DATEDIFF(CURDATE(), m.date_of_birth)/365.25)) >= 18
      AND om.organization_id = (SELECT id FROM organization WHERE organization_type = 'UMYF')
      AND om.membership_status = 'ACTIVE'
      LIMIT 50
    `;

    if ((agedOutMembers as any[]).length > 0) {
      exceptions.push({
        type: 'AGED_OUT_YOUTH_MEMBERS',
        severity: 'MEDIUM',
        description: 'Youth members who have aged out of UMYF',
        count: (agedOutMembers as any[]).length,
        details: agedOutMembers,
      });
    }

    // Find missing treasurers
    const orgsWithoutTreasurer = await prisma.$queryRaw`
      SELECT o.id, o.name
      FROM organization o
      WHERE o.status = 'ACTIVE'
      AND NOT EXISTS (
        SELECT 1 FROM organization_role_assignment ora
        WHERE ora.organization_id = o.id
        AND ora.position = 'Treasurer'
        AND ora.end_date IS NULL
      )
    `;

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
