export const CATEGORIES = ['FINANCIAL', 'ACCOUNTING', 'MEMBERSHIP', 'ATTENDANCE', 'AUDIT'] as const;
export type ReportCategory = (typeof CATEGORIES)[number];

export interface CatalogEntry {
  type: string;
  category: ReportCategory;
  label: string;
  permission: string;
  needsDates: boolean;
  allowed: boolean;
}

export const PERIODS = ['LAST_7_DAYS', 'LAST_30_DAYS', 'LAST_90_DAYS', 'THIS_MONTH', 'LAST_MONTH', 'THIS_YEAR', 'LAST_YEAR'] as const;
export type Period = (typeof PERIODS)[number];
export const FORMATS = ['PDF', 'CSV', 'XLSX', 'JSON'] as const;
export type ReportFormat = (typeof FORMATS)[number];
export const SCHEDULES = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'] as const;
export type Schedule = (typeof SCHEDULES)[number];

export interface ReportParams {
  period?: Period;
  startDate?: string;
  endDate?: string;
  sectionId?: string;
  organizationId?: string;
  membershipStatus?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  eventType?: string;
}

export interface SavedReport {
  id: string;
  createdBy: string;
  name: string;
  description: string | null;
  reportType: string;
  parameters: ReportParams;
  format: ReportFormat;
  visibility: 'PRIVATE' | 'CHURCH';
  schedule: Schedule;
  recipients: string[] | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  isActive: boolean;
  failureCount: number;
}

export interface Execution {
  id: string;
  reportId: string | null;
  reportType: string;
  format: string;
  trigger: 'ADHOC' | 'MANUAL' | 'SCHEDULED';
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  rowCount: number | null;
  byteSize: number | null;
  filename: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface Paged<T> { items: T[]; total: number }

export type RunOutcome = { kind: 'file'; filename: string } | { kind: 'json'; filename: string; data: unknown };

export interface MembersBlock { total: number; active: number; byStatus: Record<string, number>; activeByGender: Record<string, number>; joinedThisMonth: number }
export interface AttendanceBlock { weeks: Array<{ week: string; events: number; present: number }>; totalPresent: number; averagePerEvent: number; truncated: boolean }
export interface MonthPoint { month: string; income: number; spending: number }
export interface FinanceBlock {
  incomeThisMonth: Record<string, number>;
  incomeThisMonthByType: Record<string, number>;
  spendingThisMonth: number;
  awaitingApproval: number;
  months: MonthPoint[];
  note: string;
  truncated: boolean;
}
export interface PastoralBlock { openCases: number; overdueFollowUps: number }
export interface UpcomingEvent { id: string; title: string; eventType: string; startDateTime: string; location: string | null }

export interface ChurchDashboard {
  generatedAt: string;
  members: MembersBlock | null;
  attendance: AttendanceBlock | null;
  finance: FinanceBlock | null;
  pastoral: PastoralBlock | null;
  upcomingEvents: UpcomingEvent[] | null;
}
export interface SectionDashboard {
  generatedAt: string;
  section: { id: string; name: string };
  members: MembersBlock | null;
  attendance: AttendanceBlock | null;
  finance: { months: MonthPoint[] } | null;
}
export interface HierarchyChurchRow { churchId: string; name: string; circuit: string | null; activeMembers: number; eventsLast30Days: number; attendanceLast30Days: number }
export interface HierarchyDashboard {
  generatedAt: string;
  level: 'CIRCUIT' | 'DISTRICT' | 'CONFERENCE';
  name: string;
  totals: { churches: number; activeMembers: number; attendanceLast30Days: number };
  churches: HierarchyChurchRow[];
}

export const recipientList = (text: string): string[] =>
  text.split(/[,\s;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
export const isEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
