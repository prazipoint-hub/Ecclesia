import { financialReportRepository } from '../repository/financial';
import { administrativeReportRepository } from '../repository/administrative';
import { auditReportRepository } from '../repository/audit';
import { prisma } from '@/database';
import { AuthorizedUser } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { strToU8, zipSync } from 'fflate';
import PDFDocument from 'pdfkit';

type ReportRow = Record<string, string | number | boolean | null>;
type ExportedReport = {
  reportType: string;
  format: string;
  generatedAt: Date;
  filename: string;
  mimeType: string;
  data: unknown;
  content: string | Buffer;
};

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
    const report = await this.formatReport(data.reportType, reportData, data.format);

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

    const report = await this.formatReport(data.reportType, reportData, data.format);

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

    const report = await this.formatReport(data.reportType, reportData, data.format);

    await this.logReportGeneration({
      churchId: data.churchId,
      reportType: data.reportType,
      userId: user.id,
      scope: 'AUDIT',
    });

    return report;
  }

  /**
   * Format report in a transport-safe representation. Binary formats are sent
   * as downloads by the controller; JSON remains inspectable by API clients.
   */
  private async formatReport(reportType: string, data: unknown, format: string): Promise<ExportedReport> {
    const normalizedFormat = format.toUpperCase();
    const filenameBase = `${reportType.toLowerCase()}-${new Date().toISOString().slice(0, 10)}`;
    const rows = this.toRows(data);

    if (normalizedFormat === 'CSV') {
      return {
        reportType,
        format: normalizedFormat,
        generatedAt: new Date(),
        filename: `${filenameBase}.csv`,
        mimeType: 'text/csv; charset=utf-8',
        data,
        content: this.toCsv(rows),
      };
    }

    if (normalizedFormat === 'XLSX') {
      const headers = this.headersFor(rows);
      return {
        reportType,
        format: normalizedFormat,
        generatedAt: new Date(),
        filename: `${filenameBase}.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        data,
        content: this.toXlsx(reportType, headers, rows),
      };
    }

    if (normalizedFormat === 'PDF') {
      return {
        reportType,
        format: normalizedFormat,
        generatedAt: new Date(),
        filename: `${filenameBase}.pdf`,
        mimeType: 'application/pdf',
        data,
        content: await this.toPdf(reportType, rows),
      };
    }

    return {
      reportType,
      format: 'JSON',
      generatedAt: new Date(),
      filename: `${filenameBase}.json`,
      mimeType: 'application/json; charset=utf-8',
      data,
      content: JSON.stringify(data, null, 2),
    };
  }

  private toRows(data: unknown): ReportRow[] {
    const items = Array.isArray(data) ? data : [data];
    return items.map((item) => this.flattenRecord(item));
  }

  private flattenRecord(value: unknown, prefix = ''): ReportRow {
    if (!value || typeof value !== 'object' || value instanceof Date) {
      return { value: this.cellValue(value) };
    }
    const flattened: ReportRow = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      const column = prefix ? `${prefix}.${key}` : key;
      if (nestedValue && typeof nestedValue === 'object' && !(nestedValue instanceof Date) && !Array.isArray(nestedValue)) {
        Object.assign(flattened, this.flattenRecord(nestedValue, column));
      } else {
        flattened[column] = this.cellValue(nestedValue);
      }
    }
    return flattened;
  }

  private cellValue(value: unknown): string | number | boolean | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'object' && 'toNumber' in value && typeof (value as { toNumber?: unknown }).toNumber === 'function') {
      return (value as { toNumber: () => number }).toNumber();
    }
    return JSON.stringify(value);
  }

  private headersFor(rows: ReportRow[]): string[] {
    const headers = new Set<string>();
    rows.forEach((row) => Object.keys(row).forEach((key) => headers.add(key)));
    return [...headers];
  }

  private toCsv(rows: ReportRow[]): string {
    const headers = this.headersFor(rows);
    const escape = (value: string | number | boolean | null | undefined) => {
      const text = value === null || value === undefined ? '' : String(value);
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    return [headers.map(escape).join(','), ...rows.map((row) => headers.map((header) => escape(row[header])).join(','))].join('\n');
  }

  /**
   * Produces a minimal Office Open XML workbook without a large spreadsheet
   * dependency. Cells use inline strings, which keeps each export standalone.
   */
  private toXlsx(reportType: string, headers: string[], rows: ReportRow[]): Buffer {
    const escapeXml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const columnName = (index: number) => {
      let value = index + 1;
      let name = '';
      while (value > 0) { const remainder = (value - 1) % 26; name = String.fromCharCode(65 + remainder) + name; value = Math.floor((value - 1) / 26); }
      return name;
    };
    const cell = (column: number, row: number, value: string | number | boolean | null) => {
      const reference = `${columnName(column)}${row}`;
      if (typeof value === 'number') return `<c r="${reference}"><v>${value}</v></c>`;
      return `<c r="${reference}" t="inlineStr"><is><t>${escapeXml(value === null ? '' : String(value))}</t></is></c>`;
    };
    const sheetRows = [headers, ...rows.map((record) => headers.map((header) => record[header] ?? null))]
      .map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, column) => cell(column, rowIndex + 1, value)).join('')}</row>`)
      .join('');
    const sheetName = escapeXml(this.sheetName(reportType));
    const files = {
      '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
      '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
      'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
      'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
      'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`),
    };
    return Buffer.from(zipSync(files, { level: 6 }));
  }

  private async toPdf(reportType: string, rows: ReportRow[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const document = new PDFDocument({ margin: 42, size: 'A4' });
      const chunks: Buffer[] = [];
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
      document.fontSize(18).text(reportType.replace(/_/g, ' '));
      document.moveDown(0.25).fontSize(9).fillColor('#555555').text(`Generated ${new Date().toLocaleString()}`);
      document.moveDown().fillColor('#000000');
      if (rows.length === 0) {
        document.fontSize(11).text('No records matched this report.');
      } else {
        rows.forEach((row, index) => {
          const line = Object.entries(row).map(([key, value]) => `${key}: ${value ?? '—'}`).join('  |  ');
          document.fontSize(9).text(line, { width: 510 });
          if (index < rows.length - 1) document.moveDown(0.35);
        });
      }
      document.end();
    });
  }

  private sheetName(reportType: string): string {
    return reportType.replace(/[^A-Za-z0-9 ]/g, '').slice(0, 31) || 'Report';
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
