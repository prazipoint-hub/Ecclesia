import { z } from 'zod';

const id = z.string().min(1);

/** Report types the generator can actually produce, with the permission each one needs. */
export const REPORT_CATALOG = [
  { type: 'INCOME_STATEMENT', category: 'FINANCIAL', label: 'Income statement (receipts and spending)', permission: 'report:view:financial', needsDates: true },
  { type: 'TRIAL_BALANCE', category: 'FINANCIAL', label: 'Trial balance (receipts and spending)', permission: 'report:view:financial', needsDates: true },
  { type: 'RECEIPT_DETAIL', category: 'FINANCIAL', label: 'Receipt detail', permission: 'report:view:financial', needsDates: true },
  { type: 'EXPENDITURE_DETAIL', category: 'FINANCIAL', label: 'Expenditure detail', permission: 'report:view:financial', needsDates: true },
  { type: 'LEDGER_TRIAL_BALANCE', category: 'ACCOUNTING', label: 'Ledger trial balance', permission: 'finance:view', needsDates: false },
  { type: 'LEDGER_INCOME_STATEMENT', category: 'ACCOUNTING', label: 'Ledger income statement', permission: 'finance:view', needsDates: false },
  { type: 'LEDGER_BALANCE_SHEET', category: 'ACCOUNTING', label: 'Ledger balance sheet', permission: 'finance:view', needsDates: false },
  { type: 'MEMBERSHIP_SUMMARY', category: 'MEMBERSHIP', label: 'Membership summary', permission: 'report:view:administrative', needsDates: false },
  { type: 'MEMBERSHIP_DETAIL', category: 'MEMBERSHIP', label: 'Membership detail (personal data)', permission: 'report:view:administrative', needsDates: false },
  { type: 'DEMOGRAPHICS', category: 'MEMBERSHIP', label: 'Demographics', permission: 'report:view:administrative', needsDates: false },
  { type: 'LEADERSHIP_ROSTER', category: 'MEMBERSHIP', label: 'Leadership roster', permission: 'report:view:administrative', needsDates: false },
  { type: 'ATTENDANCE_SUMMARY', category: 'ATTENDANCE', label: 'Attendance summary', permission: 'report:view:administrative', needsDates: true },
  { type: 'ATTENDANCE_DETAIL', category: 'ATTENDANCE', label: 'Attendance detail', permission: 'report:view:administrative', needsDates: true },
  { type: 'ATTENDANCE_ANALYTICS', category: 'ATTENDANCE', label: 'Attendance analytics', permission: 'attendance:analytics:view', needsDates: false },
  { type: 'PROFILE_COMPLETION', category: 'MEMBERSHIP', label: 'Profile completion (counts only)', permission: 'member:profile:report', needsDates: false },
  { type: 'LEADERSHIP_REGISTER_ASOF', category: 'MEMBERSHIP', label: 'Leadership register as at a date (end date, default today)', permission: 'leadership:appointment:view', needsDates: false },
  { type: 'MEMBERSHIP_DISTINCT', category: 'MEMBERSHIP', label: 'Membership (each person counted once)', permission: 'report:view:administrative', needsDates: false },
  { type: 'CASH_SESSIONS', category: 'POS', label: 'Cash sessions, counts and discrepancies', permission: 'finance:cash_session:review', needsDates: true },
  { type: 'DEPOSITS', category: 'POS', label: 'Cash deposits to bank', permission: 'finance:view', needsDates: true },
  { type: 'SECTION_AUDIT_EVIDENCE', category: 'FINANCIAL', label: 'Section audit evidence (choose a section)', permission: 'report:view:section_finance', needsDates: true },
  { type: 'TREASURER_OVERVIEW', category: 'POS', label: 'Treasurer: approved vs pending cash and deposits', permission: 'finance:view', needsDates: false },
  { type: 'AUDIT_TRAIL', category: 'AUDIT', label: 'Audit trail', permission: 'report:view:audit', needsDates: true },
  { type: 'EXCEPTION_REPORT', category: 'AUDIT', label: 'Exception report', permission: 'report:view:audit', needsDates: true },
] as const;

export type CatalogType = (typeof REPORT_CATALOG)[number]['type'];
const TYPES = REPORT_CATALOG.map((r) => r.type) as [CatalogType, ...CatalogType[]];
export const SavedReportTypeEnum = z.enum(TYPES);

export const PeriodEnum = z.enum(['LAST_7_DAYS', 'LAST_30_DAYS', 'LAST_90_DAYS', 'THIS_MONTH', 'LAST_MONTH', 'THIS_YEAR', 'LAST_YEAR']);

/** Dates are either fixed or a rolling period, so a scheduled report keeps meaning "last month" next month. */
export const ReportParamsSchema = z
  .object({
    period: PeriodEnum.optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    sectionId: id.optional(),
    organizationId: id.optional(),
    membershipStatus: z.string().trim().max(40).optional(),
    entityType: z.string().trim().max(60).optional(),
    entityId: z.string().trim().max(100).optional(),
    action: z.string().trim().max(100).optional(),
    eventType: z.string().trim().max(80).optional(),
  })
  .strict();

const FormatEnum = z.enum(['PDF', 'CSV', 'XLSX', 'JSON']);
const emails = z.array(z.string().trim().toLowerCase().email().max(190)).max(20);

export const RunReportSchema = z.object({ reportType: SavedReportTypeEnum, parameters: ReportParamsSchema.default({}), format: FormatEnum.default('PDF') });

export const CreateSavedReportSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(500).optional(),
    reportType: SavedReportTypeEnum,
    parameters: ReportParamsSchema.default({}),
    format: FormatEnum.default('PDF'),
    visibility: z.enum(['PRIVATE', 'CHURCH']).default('PRIVATE'),
    schedule: z.enum(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY']).default('NONE'),
    recipients: emails.default([]),
  })
  .strict();

export const UpdateSavedReportSchema = CreateSavedReportSchema.partial().extend({ isActive: z.boolean().optional() }).strict();

export const SavedListQuerySchema = z.object({ mine: z.coerce.boolean().optional() });
export const ExecutionListQuerySchema = z.object({
  reportId: id.optional(),
  skip: z.coerce.number().int().min(0).max(100_000).default(0),
  take: z.coerce.number().int().min(1).max(100).default(25),
});
export const SectionDashboardParamsSchema = z.object({ sectionId: id });
export const HierarchyLevelSchema = z.enum(['CIRCUIT', 'DISTRICT', 'CONFERENCE']);

export type ReportParams = z.infer<typeof ReportParamsSchema>;
export type RunReportInput = z.infer<typeof RunReportSchema>;
export type CreateSavedReportInput = z.infer<typeof CreateSavedReportSchema>;
export type UpdateSavedReportInput = z.infer<typeof UpdateSavedReportSchema>;
