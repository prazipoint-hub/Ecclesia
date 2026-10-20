import { financialReportRepository } from '../repository/financial';
import { administrativeReportRepository } from '../repository/administrative';
import { auditReportRepository } from '../repository/audit';
import { prisma } from '@/database';
import { AuthorizedUser } from '@/types';
import { v4 as uuidv4 } from 'uuid';

/**
 * REPORTING SERVICE
 *
 * CRITICAL PRINCIPLES:
 *
 * 1. All reports are READ-ONLY
 * 2. Reports enforce organizational scope (no cross-church/org/section data leakage)
 * 3. Financial reports exclude organization/section funds from main church totals
 * 4. Authorization checks verify user can access requested scope
 * 5. All report generation is audited
 */
export class ReportingService {
  /**
   * Generate financial report
   * Authorization: Must have report:view:financial permission for requested scope
   */
  async generateFinancialReport(
    data: {
      churchId: string;
      reportType: string;
      startDate: Date;
      endDate: Date;
      organizationId?: string;
      sectionId?: string;
      scope: string;
      format: string;
    },
    user: AuthorizedUser
  ) {
    // Authorization
    if (!user.permissions.includes('report:view:financial')) {
      throw new Error('Unauthorized: report:view:financial permission required');
    }

    // Scope validation
    if (data.churchId !== user.churchId && !user.permissions.includes('report:view:all_churches')) {
      throw new Error('Unauthorized: cannot generate reports for another church');
    }

    // Additional scope checks
    if (data.organizationId) {
      const org = await prisma.organization.findUnique({
        where: { id: data.organizationId },
      });

      if (!org || org.churchId !== data.churchId) {
        throw new Error('Organization not found in this church');
      }

      if (!user.permissions.includes('report:view:organization_finance')) {
        throw new Error('Unauthorized: cannot view organization financial reports');
      }
    }

    if (data.sectionId) {
      const section = await prisma.section.findUnique({
        where: { id: data.sectionId },
      });

      if (!section || section.churchId !== data.churchId) {
        throw new Error('Section not found in this church');
      }

      if (!user.permissions.includes('report:view:section_finance')) {
        throw new Error('Unauthorized: cannot view section financial reports');
      }
    }

    let reportData: any;

    switch (data.reportType) {
      case 'INCOME_STATEMENT':
        reportData = await financialReportRepository.getIncomeStatementData(
          data.churchId,
          data.startDate,
          data.endDate,
          data.organizationId,
          data.sectionId
        );
        break;

      case 'TRIAL_BALANCE':
        reportData = await financialReportRepository.getTrialBalanceData(
          data.churchId,
          data.endDate,
          data.organizationId,
          data.sectionId
        );
        break;

      case 'RECEIPT_DETAIL':
        reportData = await financialReportRepository.getReceiptDetails(
          data.churchId,
          data.startDate,
          data.endDate,
          data.organizationId,
          data.sectionId
        );
        break;

      case 'EXPENDITURE_DETAIL':
        reportData = await financialReportRepository.getExpenditureDetails(
          data.churchId,
          data.startDate,
          data.endDate,
          data.organizationId,
          data.sectionId
        );
        break;

      default:
        throw new Error(`Unsupported report type: ${data.reportType}`);
    }

    // Format report
    const report = this.formatReport(data.reportType, reportData, data.format);

    // Audit log
    await this.logReportGeneration({
      churchId: data.churchId,
      reportType: data.reportType,
      userId: user.id,
      scope: data.scope,
      organizationId: data.organizationId,
      sectionId: data.sectionId,
    });

    return report;
  }

  /**
   * Generate administrative report
   * Authorization: Must have report:view:administrative permission
   */
  async generateAdministrativeReport(
    data: {
      churchId: string;
      reportType: string;
      startDate?: Date;
      endDate?: Date;
      organizationId?: string;
      sectionId?: string;
      membershipStatus?: string;
      format: string;
    },
    user: AuthorizedUser
  ) {
    if (!user.permissions.includes('report:view:administrative')) {
      throw new Error('Unauthorized: report:view:administrative permission required');
    }

    if (data.churchId !== user.churchId && !user.permissions.includes('report:view:all_churches')) {
      throw new Error('Unauthorized: cannot generate reports for another church');
    }

    let reportData: any;

    switch (data.reportType) {
      case 'MEMBERSHIP_SUMMARY':
        reportData = await administrativeReportRepository.getMembershipSummary(
          data.churchId,
          data.organizationId,
          data.sectionId,
          data.membershipStatus
        );
        break;

      case 'MEMBERSHIP_DETAIL':
        reportData = await administrativeReportRepository.getMembershipDetails(
          data.churchId,
          data.organizationId,
          data.sectionId,
          data.membershipStatus
        );
        break;

      case 'ATTENDANCE_SUMMARY':
        if (!data.startDate || !data.endDate) {
          throw new Error('startDate and endDate required for attendance reports');
        }
        reportData = await administrativeReportRepository.getAttendanceSummary(
          data.churchId,
          data.startDate,
          data.endDate,
          data.organizationId,
          data.sectionId
        );
        break;

      case 'ATTENDANCE_DETAIL':
        if (!data.startDate || !data.endDate) {
          throw new Error('startDate and endDate required for attendance reports');
        }
        reportData = await administrativeReportRepository.getAttendanceDetails(
          data.churchId,
          data.startDate,
          data.endDate,
          data.organizationId,
          data.sectionId
        );
        break;

      case 'LEADERSHIP_ROSTER':
        reportData = await administrativeReportRepository.getLeadershipRoster(
          data.churchId,
          data.organizationId,
          data.sectionId
        );
        break;

      case 'DEMOGRAPHICS':
        reportData = await administrativeReportRepository.getDemographicSummary(data.churchId, data.sectionId);
        break;

      default:
        throw new Error(`Unsupported report type: ${data.reportType}`);
    }

    const report = this.formatReport(data.reportType, reportData, data.format);

    await this.logReportGeneration({
      churchId: data.churchId,
      reportType: data.reportType,
      userId: user.id,
      scope: data.sectionId ? 'SECTION' : data.organizationId ? 'ORGANIZATION' : 'CHURCH',
      organizationId: data.organizationId,
      sectionId: data.sectionId,
    });

    return report;
  }

  /**
   * Generate audit report
   * Authorization: Must have report:view:audit permission (typically Audit Committee)
   */
  async generateAuditReport(
    data: {
      churchId: string;
      reportType: string;
      startDate: Date;
      endDate: Date;
      entityType?: string;
      entityId?: string;
      action?: string;
      format: string;
    },
    user: AuthorizedUser
  ) {
    if (!user.permissions.includes('report:view:audit')) {
      throw new Error('Unauthorized: report:view:audit permission required');
    }

    if (data.churchId !== user.churchId && !user.permissions.includes('report:view:all_churches')) {
      throw new Error('Unauthorized: cannot generate reports for another church');
    }

    let reportData: any;

    switch (data.reportType) {
      case 'AUDIT_TRAIL':
        reportData = await auditReportRepository.getAuditTrail(
          data.churchId,
          data.startDate,
          data.endDate,
          data.entityType,
          data.entityId,
          data.action
        );
        break;

      case 'EXCEPTION_REPORT':
        reportData = await auditReportRepository.getExceptionReport(data.churchId, data.startDate, data.endDate);
        break;

      default:
        throw new Error(`Unsupported report type: ${data.reportType}`);
    }

    const report = this.formatReport(data.reportType, reportData, data.format);

    await this.logReportGeneration({
      churchId: data.churchId,
      reportType: data.reportType,
      userId: user.id,
      scope: 'AUDIT',
    });

    return report;
  }

  /**
   * Format report based on type and format
   * TODO: Implement actual PDF/CSV/XLSX generation
   */
  private formatReport(reportType: string, data: any, format: string): any {
    // This is a placeholder; actual implementation would use libraries like:
    // - pdfkit for PDF
    // - csv-stringify for CSV
    // - exceljs for XLSX

    return {
      reportType,
      format,
      generatedAt: new Date(),
      data,
      content: JSON.stringify(data, null, 2),
    };
  }

  /**
   * Audit log report generation
   */
  private async logReportGeneration(data: {
    churchId: string;
    reportType: string;
    userId: string;
    scope: string;
    organizationId?: string;
    sectionId?: string;
  }): Promise<void> {
    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        action: 'REPORT_GENERATED',
        actorId: data.userId,
        entityType: 'REPORT',
        entityId: data.reportType,
        churchId: data.churchId,
        changes: JSON.stringify({
          reportType: data.reportType,
          scope: data.scope,
          organizationId: data.organizationId,
          sectionId: data.sectionId,
        }),
        timestamp: new Date(),
      },
    });
  }
}

export const reportingService = new ReportingService();
