export { can } from '@/types/notifications';

// ------------------------------------------------------------------ members
export type MembershipStatus = 'ACTIVE' | 'INACTIVE' | 'TRANSFERRED' | 'DECEASED';
export type ArchiveFilter = 'exclude' | 'include' | 'only';

export interface DirectoryMember {
  id: string;
  membershipNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  email: string | null;
  phone: string | null;
  gender: string | null;
  membershipStatus: MembershipStatus;
  joinDate: string;
  archivedAt: string | null;
  isDependent: boolean;
  sectionId: string | null;
  sectionName: string | null;
}

export interface DirectoryPage {
  items: DirectoryMember[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DirectoryFilters {
  q?: string;
  status?: MembershipStatus;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  sectionId?: string;
  archived: ArchiveFilter;
  sort: 'name' | 'joined';
}

/** The raw member row returned by GET /members/:id. */
export interface MemberDetail {
  id: string;
  membershipNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  email: string | null;
  phone: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  address: string | null;
  maritalStatus: string | null;
  membershipStatus: MembershipStatus;
  joinDate: string;
  membershipDate: string;
  archivedAt?: string | null;
  isDependent: boolean;
  church?: { name: string } | null;
}

export interface ImportRowError { row: number; message: string }

export interface ImportPreview {
  totalRows: number;
  validRows: number;
  errorCount: number;
  errors: ImportRowError[];
  ignoredColumns: string[];
}

export interface ImportResult {
  id: string;
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED';
  totalRows: number;
  imported: number;
  skipped: number;
  errors: ImportRowError[];
}

export interface ImportHistoryItem {
  id: string;
  fileName: string;
  status: ImportResult['status'];
  totalRows: number;
  imported: number;
  skipped: number;
  createdAt: string;
}

export const IMPORT_TEMPLATE = [
  'firstName,middleName,lastName,gender,dateOfBirth,phone,email,address,section,membershipStatus,maritalStatus,membershipDate',
  'Ada,,Moyo,F,1990-04-12,0771234567,ada@example.com,"12 Main Street, Harare",,ACTIVE,SINGLE,2020-01-05',
].join('\r\n') + '\r\n';

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

// ----------------------------------------------------------------- visitors
export type VisitorStatus = 'NEW' | 'CONTACTED' | 'SCHEDULED' | 'JOINED' | 'NOT_INTERESTED';
export const VISITOR_STATUSES: VisitorStatus[] = ['NEW', 'CONTACTED', 'SCHEDULED', 'JOINED', 'NOT_INTERESTED'];
export type FollowUpMethod = 'CALL' | 'VISIT' | 'MESSAGE' | 'OTHER';

export interface VisitorFollowUp { id: string; method: FollowUpMethod; notes: string | null; createdAt: string }

export interface Visitor {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  visitDate: string;
  source: string | null;
  notes: string | null;
  followUpStatus: VisitorStatus;
  assignedToId: string | null;
  convertedMemberId: string | null;
  createdAt: string;
  followUps: VisitorFollowUp[];
}

export interface VisitorPage {
  items: Visitor[];
  total: number;
  page: number;
  pageSize: number;
  statusCounts: Partial<Record<VisitorStatus, number>>;
}

export interface ConvertResult { visitor: Visitor; member: { id: string; membershipNumber: string } }

// ------------------------------------------------------------------ meetings
export type MeetingStatus = 'SCHEDULED' | 'HELD' | 'CANCELLED';
export type DecisionStatus = 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'DEFERRED';
export const DECISION_STATUSES: DecisionStatus[] = ['PROPOSED', 'APPROVED', 'REJECTED', 'DEFERRED'];

export interface MeetingSummary {
  id: string;
  title: string;
  scheduledAt: string;
  location: string | null;
  status: MeetingStatus;
  minutesLocked: boolean;
  decisionCount: number;
}

export interface MeetingPage { items: MeetingSummary[]; total: number; page: number; pageSize: number }

export interface Decision {
  id: string;
  description: string;
  status: DecisionStatus;
  votesFor: number;
  votesAgainst: number;
  abstentions: number;
  ownerMemberId: string | null;
  dueDate: string | null;
}

export interface MeetingDetail {
  id: string;
  committeeId: string;
  committeeName: string;
  title: string;
  scheduledAt: string;
  location: string | null;
  agenda: string | null;
  minutes: string | null;
  status: MeetingStatus;
  minutesLocked: boolean;
  minutesLockedAt: string | null;
  decisions: Decision[];
}

export interface CommitteeSummary { id: string; name: string }

// --------------------------------------------------------------- leadership
export type TermStatus = 'ACTIVE' | 'COMPLETED' | 'TERMINATED';

export interface PersonRef { id: string; firstName: string; lastName: string }

export interface Appointment {
  id: string;
  member: PersonRef;
  role: { id: string; name: string };
  committee: { id: string; name: string } | null;
  position: string | null;
  startDate: string;
  endDate: string | null;
  termCount: number;
  currentTerm: { id: string; termNumber: number; startDate: string; plannedEndDate: string | null } | null;
}

export interface AppointmentPage { items: Appointment[]; total: number; page: number; pageSize: number }

export interface TermItem {
  id: string;
  assignmentId: string;
  termNumber: number;
  status: TermStatus;
  startDate: string;
  plannedEndDate: string | null;
  endDate: string | null;
  successorId: string | null;
  notes: string | null;
  member: PersonRef;
  roleName: string;
  committeeName: string | null;
  position: string | null;
  daysRemaining: number | null;
}

export interface TermPage { items: TermItem[]; total: number; page: number; pageSize: number }

export const fullName = (p: { firstName: string; middleName?: string | null; lastName: string }): string =>
  [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ');

/** datetime-local / date inputs give local wall-clock strings; send an unambiguous instant. */
export const toIso = (value: string): string => new Date(value).toISOString();

export const toLocalInput = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const toDateInput = (iso: string | null | undefined): string => (iso ? iso.slice(0, 10) : '');
