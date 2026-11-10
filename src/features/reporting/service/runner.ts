import { prisma } from '@/database';
import type { AuthorizedUser } from '@/types';
import { attendanceAnalyticsService } from '@/features/events/service/analytics';
import { ledgerService } from '@/features/accounting/service/ledger';
import { ForbiddenError, ValidationError } from '@/types/errors';
import { REPORT_CATALOG, type CatalogType, type ReportParams } from '../types/saved';
import { reportingService } from './index';
import { extraReports } from './extraReports';

const DAY = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 800;

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const endOfDayUtc = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));

/** Turns a rolling period into concrete dates at the moment the report runs. */
export function resolveDates(params: ReportParams, now = new Date()): { start?: Date; end?: Date } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  switch (params.period) {
    case 'LAST_7_DAYS': return { start: new Date(now.getTime() - 7 * DAY), end: now };
    case 'LAST_30_DAYS': return { start: new Date(now.getTime() - 30 * DAY), end: now };
    case 'LAST_90_DAYS': return { start: new Date(now.getTime() - 90 * DAY), end: now };
    case 'THIS_MONTH': return { start: utc(y, m, 1), end: now };
    case 'LAST_MONTH': return { start: utc(y, m - 1, 1), end: new Date(utc(y, m, 1).getTime() - 1) };
    case 'THIS_YEAR': return { start: utc(y, 0, 1), end: now };
    case 'LAST_YEAR': return { start: utc(y - 1, 0, 1), end: new Date(utc(y, 0, 1).getTime() - 1) };
    default: return { start: params.startDate, end: params.endDate ? endOfDayUtc(params.endDate) : undefined };
  }
}

export const catalogEntry = (type: string) => REPORT_CATALOG.find((r) => r.type === type);

/** Statements come back as sections of rows plus totals; this lays them out as one flat table. */
function statementRows(statement: Record<string, unknown>): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const [key, value] of Object.entries(statement)) {
    if (Array.isArray(value)) value.forEach((item) => rows.push({ section: key, ...(item as object) }));
    else if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') rows.push({ section: 'SUMMARY', name: key, amount: value });
    else if (value && typeof value === 'object' && !(value instanceof Date)) {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (typeof v === 'number') rows.push({ section: key, name: k, amount: v });
    }
  }
  return rows;
}

export type RunResult = { report: Awaited<ReturnType<typeof reportingService.generateFinancialReport>>; rowCount: number };

export class ReportRunner {
  /** Runs one report as `user`, who must hold the permission that report type needs. */
  async run(user: AuthorizedUser, reportType: CatalogType, params: ReportParams, format: string, now = new Date()): Promise<RunResult> {
    const entry = catalogEntry(reportType);
    if (!entry) throw new ValidationError(`Unknown report type ${reportType}`);
    if (!user.permissions.includes(entry.permission)) throw new ForbiddenError(`Forbidden: ${entry.permission} permission required`);

    const { start, end } = resolveDates(params, now);
    if (entry.needsDates && (!start || !end)) throw new ValidationError('Choose a period, or both a start and an end date');
    if (start && end && start > end) throw new ValidationError('The start date must be before the end date');
    if (start && end && end.getTime() - start.getTime() > MAX_RANGE_DAYS * DAY) throw new ValidationError('Choose a period of about two years or less');

    const base = { churchId: user.churchId, reportType, format, organizationId: params.organizationId, sectionId: params.sectionId };
    let report: RunResult['report'];

    const extra: Partial<Record<CatalogType, () => Promise<Record<string, unknown>[]>>> = {
      PROFILE_COMPLETION: () => extraReports.profileCompletion(user),
      LEADERSHIP_REGISTER_ASOF: () => extraReports.leadershipRegister(user, end),
      MEMBERSHIP_DISTINCT: () => extraReports.membershipDistinct(user),
      CASH_SESSIONS: () => extraReports.cashSessions(user, start!, end!),
      DEPOSITS: () => extraReports.deposits(user, start!, end!),
      TREASURER_OVERVIEW: () => extraReports.treasurer(user),
      SECTION_AUDIT_EVIDENCE: () => extraReports.sectionAuditEvidence(user, params.sectionId, start!, end!),
    };

    if (extra[reportType]) {
      report = await reportingService.formatReport(reportType, await extra[reportType]!(), format);
      await prisma.auditLog.create({ data: { churchId: user.churchId, action: 'REPORT_GENERATED', entityType: 'REPORT', entityId: reportType, actorId: user.memberId ?? user.id, changes: JSON.stringify({ reportType, format }) } }).catch(() => undefined);
    } else if (entry.category === 'FINANCIAL') {
      report = await reportingService.generateFinancialReport(
        { ...base, startDate: start!, endDate: end!, scope: params.organizationId ? 'ORGANIZATION' : params.sectionId ? 'SECTION' : 'CHURCH' },
        user
      );
    } else if (entry.category === 'MEMBERSHIP' || reportType === 'ATTENDANCE_SUMMARY' || reportType === 'ATTENDANCE_DETAIL') {
      report = await reportingService.generateAdministrativeReport({ ...base, startDate: start, endDate: end, membershipStatus: params.membershipStatus }, user);
    } else if (entry.category === 'AUDIT') {
      report = await reportingService.generateAuditReport(
        { churchId: user.churchId, reportType, startDate: start!, endDate: end!, entityType: params.entityType, entityId: params.entityId, action: params.action, format },
        user
      );
    } else if (reportType === 'LEDGER_TRIAL_BALANCE') {
      const rows = (await ledgerService.trialBalance(user, end)).rows;
      report = await reportingService.formatReport(reportType, rows, format);
    } else if (reportType === 'LEDGER_INCOME_STATEMENT') {
      report = await reportingService.formatReport(reportType, statementRows(await ledgerService.incomeStatement(user, start, end) as never), format);
    } else if (reportType === 'LEDGER_BALANCE_SHEET') {
      report = await reportingService.formatReport(reportType, statementRows(await ledgerService.balanceSheet(user, end) as never), format);
    } else {
      const analytics = await attendanceAnalyticsService.attendance(user, { from: start, to: end, eventType: params.eventType, sectionId: params.sectionId });
      report = await reportingService.formatReport(reportType, analytics.events, format);
    }

    return { report, rowCount: Array.isArray(report.data) ? report.data.length : 1 };
  }
}

export const reportRunner = new ReportRunner();
