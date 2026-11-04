import { z } from 'zod';

/**
 * REPORTING & ANALYTICS TYPES
 *
 * Comprehensive reporting system for financial, administrative, and ad-hoc reports
 * with support for filtering, aggregation, and export functionality.
 */

export const ReportTypeEnum = z.enum([
  // Financial Reports
  'INCOME_STATEMENT',
  'BALANCE_SHEET',
  'CASH_FLOW',
  'TRIAL_BALANCE',
  'RECEIPT_DETAIL',
  'EXPENDITURE_DETAIL',
  'CASH_SESSION_RECONCILIATION',
  'FUND_PERFORMANCE',
  // Administrative Reports
  'MEMBERSHIP_SUMMARY',
  'MEMBERSHIP_DETAIL',
  'ATTENDANCE_SUMMARY',
  'ATTENDANCE_DETAIL',
  'LEADERSHIP_ROSTER',
  'DEMOGRAPHICS',
  // Organization Reports
  'ORGANIZATION_FINANCIAL',
  'ORGANIZATION_MEMBERSHIP',
  'ORGANIZATION_ATTENDANCE',
  'SECTION_FINANCIAL',
  'SECTION_MEMBERSHIP',
  // Audit Reports
  'AUDIT_TRAIL',
  'EXCEPTION_REPORT',
]);

export const ReportFormatEnum = z.enum(['PDF', 'CSV', 'JSON', 'XLSX']);

export const GenerateFinancialReportSchema = z.object({
  churchId: z.string().uuid(),
  reportType: z.enum([
    'INCOME_STATEMENT',
    'BALANCE_SHEET',
    'CASH_FLOW',
    'TRIAL_BALANCE',
    'RECEIPT_DETAIL',
    'EXPENDITURE_DETAIL',
  ]),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  organizationId: z.string().uuid().optional(),
  sectionId: z.string().uuid().optional(),
  scope: z.enum(['CHURCH', 'ORGANIZATION', 'SECTION']).default('CHURCH'),
  format: ReportFormatEnum.default('PDF'),
});

export const GenerateAdministrativeReportSchema = z.object({
  churchId: z.string().uuid(),
  reportType: z.enum([
    'MEMBERSHIP_SUMMARY',
    'MEMBERSHIP_DETAIL',
    'ATTENDANCE_SUMMARY',
    'ATTENDANCE_DETAIL',
    'LEADERSHIP_ROSTER',
    'DEMOGRAPHICS',
  ]),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  organizationId: z.string().uuid().optional(),
  sectionId: z.string().uuid().optional(),
  membershipStatus: z.string().optional(),
  ageRange: z.object({ min: z.number(), max: z.number() }).optional(),
  format: ReportFormatEnum.default('PDF'),
});

export const GenerateAuditReportSchema = z.object({
  churchId: z.string().uuid(),
  reportType: z.enum(['AUDIT_TRAIL', 'EXCEPTION_REPORT']),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  action: z.string().optional(),
  format: ReportFormatEnum.default('PDF'),
});

export const SavedReportSchema = z.object({
  churchId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  reportType: ReportTypeEnum,
  parameters: z.record(z.any()),
  schedule: z.enum(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY']).optional(),
  recipients: z.array(z.string().email()).optional(),
});

export const FinancialSummarySchema = z.object({
  period: z.string(),
  totalIncome: z.number(),
  totalExpense: z.number(),
  netIncome: z.number(),
  currentBalance: z.number(),
  currency: z.string(),
  scope: z.string(),
});

export const MembershipSummarySchema = z.object({
  totalMembers: z.number(),
  activeMembers: z.number(),
  inactiveMembers: z.number(),
  newMembersThisPeriod: z.number(),
  deceased: z.number(),
  transferred: z.number(),
  averageAge: z.number().optional(),
  maleCount: z.number().optional(),
  femaleCount: z.number().optional(),
});

export const AttendanceSummarySchema = z.object({
  eventId: z.string().uuid().optional(),
  totalEvents: z.number(),
  totalAttendances: z.number(),
  averageAttendancePerEvent: z.number(),
  attendanceRate: z.number(), // percentage
  byOrganization: z.record(z.number()).optional(),
  bySection: z.record(z.number()).optional(),
});

export type GenerateFinancialReportInput = z.infer<typeof GenerateFinancialReportSchema>;
export type GenerateAdministrativeReportInput = z.infer<typeof GenerateAdministrativeReportSchema>;
export type GenerateAuditReportInput = z.infer<typeof GenerateAuditReportSchema>;
export type SavedReportInput = z.infer<typeof SavedReportSchema>;
export type FinancialSummary = z.infer<typeof FinancialSummarySchema>;
export type MembershipSummary = z.infer<typeof MembershipSummarySchema>;
export type AttendanceSummary = z.infer<typeof AttendanceSummarySchema>;
