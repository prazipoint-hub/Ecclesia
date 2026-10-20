// Pastoral domain types and validation schemas

import { z } from 'zod';

// ============================================================================
// PASTORAL CASE TYPES
// ============================================================================

export const CaseCategoryEnum = z.enum([
  'SPIRITUAL',
  'FAMILY',
  'MARRIAGE',
  'BEREAVEMENT',
  'EMOTIONAL',
  'FINANCIAL',
  'CAREER',
  'HEALTH_SUPPORT',
  'YOUTH',
  'CHILD',
  'PARENTING',
  'RELATIONSHIP',
  'CRISIS',
  'ADDICTION_SUPPORT',
  'LIFE_DECISION',
  'DISCIPLESHIP',
  'OTHER',
]);

export const CasePriorityEnum = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);

export const CaseStatusEnum = z.enum([
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOLLOW_UP',
  'REFERRED',
  'RESOLVED',
  'CLOSED',
]);

export const CreatePastoralCaseSchema = z.object({
  memberId: z.string().min(1, 'Member ID required'),
  category: CaseCategoryEnum,
  concern: z.string().min(10, 'Concern must be at least 10 characters'),
  priority: CasePriorityEnum.default('NORMAL'),
  assignedPastorId: z.string().optional(),
  targetFollowUpAt: z.coerce.date().optional(),
});

export const UpdatePastoralCaseSchema = z.object({
  status: CaseStatusEnum.optional(),
  priority: CasePriorityEnum.optional(),
  concern: z.string().optional(),
  assignedPastorId: z.string().optional(),
  targetFollowUpAt: z.coerce.date().optional(),
});

export const ClosePastoralCaseSchema = z.object({
  resolvedReason: z.string().min(10, 'Resolved reason required'),
});

export type CreatePastoralCaseDTO = z.infer<typeof CreatePastoralCaseSchema>;
export type UpdatePastoralCaseDTO = z.infer<typeof UpdatePastoralCaseSchema>;
export type ClosePastoralCaseDTO = z.infer<typeof ClosePastoralCaseSchema>;

export type PastoralCaseCategory = z.infer<typeof CaseCategoryEnum>;
export type CasePriority = z.infer<typeof CasePriorityEnum>;
export type CaseStatus = z.infer<typeof CaseStatusEnum>;

// ============================================================================
// PASTORAL VISIT TYPES
// ============================================================================

export const VisitTypeEnum = z.enum([
  'GENERAL_PASTORAL',
  'SICKNESS',
  'HOSPITAL',
  'BEREAVEMENT',
  'FAMILY',
  'MARRIAGE',
  'NEW_MEMBER',
  'INACTIVE_MEMBER',
  'ELDERLY',
  'BIRTH',
  'CELEBRATION',
  'FINANCIAL_SUPPORT',
  'SPIRITUAL_SUPPORT',
  'CRISIS',
  'FOLLOW_UP',
  'OTHER',
]);

export const VisitOutcomeEnum = z.enum([
  'NO_FURTHER_ACTION',
  'FOLLOW_UP_REQUIRED',
  'COUNSELING_REQUIRED',
  'FINANCIAL_ASSISTANCE',
  'FAMILY_INTERVENTION',
  'REFERRAL',
  'PRAYER_SUPPORT',
]);

export const CreatePastoralVisitSchema = z.object({
  memberId: z.string().min(1, 'Member ID required'),
  caseId: z.string().optional(),
  visitType: VisitTypeEnum,
  visitDate: z.coerce.date(),
  location: z.string().optional(),
  purpose: z.string().min(10, 'Purpose required'),
  observations: z.string().min(20, 'Observations required'),
  outcome: VisitOutcomeEnum,
  followUpRequired: z.boolean().default(false),
  followUpDate: z.coerce.date().optional(),
});

export const UpdatePastoralVisitSchema = z.object({
  outcome: VisitOutcomeEnum.optional(),
  observations: z.string().optional(),
  followUpRequired: z.boolean().optional(),
  followUpDate: z.coerce.date().optional(),
});

export type CreatePastoralVisitDTO = z.infer<typeof CreatePastoralVisitSchema>;
export type UpdatePastoralVisitDTO = z.infer<typeof UpdatePastoralVisitSchema>;

export type VisitType = z.infer<typeof VisitTypeEnum>;
export type VisitOutcome = z.infer<typeof VisitOutcomeEnum>;

// ============================================================================
// PASTORAL CASE ACTIVITY TYPES
// ============================================================================

export const CaseActivityTypeEnum = z.enum([
  'VISIT',
  'COUNSELING',
  'PRAYER',
  'PHONE_CALL',
  'MESSAGE',
  'REFERRAL',
  'ASSISTANCE',
  'FAMILY_INTERVENTION',
  'FOLLOW_UP',
  'ASSESSMENT',
  'NOTE',
]);

export const AddCaseActivitySchema = z.object({
  activityType: CaseActivityTypeEnum,
  description: z.string().min(10, 'Description required'),
  notes: z.string().optional(),
  occurredAt: z.coerce.date().default(() => new Date()),
});

export type AddCaseActivityDTO = z.infer<typeof AddCaseActivitySchema>;
export type CaseActivityType = z.infer<typeof CaseActivityTypeEnum>;

// ============================================================================
// WELLBEING ASSESSMENT TYPES
// ============================================================================

export const SpiritualStatusEnum = z.enum([
  'HEALTHY',
  'STABLE',
  'DISENGAGED',
  'NEEDS_DISCIPLESHIP',
  'FAITH_CRISIS',
  'GROWING',
  'LEADERSHIP_DEVELOPMENT',
]);

export const SocialStatusEnum = z.enum([
  'HEALTHY',
  'FAMILY_CONFLICT',
  'MARRIAGE_DIFFICULTY',
  'BEREAVEMENT',
  'SOCIAL_ISOLATION',
  'PARENTING_CONCERN',
  'FAMILY_TRANSITION',
]);

export const EmotionalStatusEnum = z.enum([
  'NORMAL',
  'GRIEF',
  'STRESS',
  'LONELINESS',
  'CRISIS',
  'EMOTIONAL_SUPPORT_NEEDED',
  'RELATIONSHIP_DIFFICULTY',
  'LIFE_TRANSITION',
]);

export const EconomicStatusEnum = z.enum([
  'SECURE',
  'EMPLOYMENT_DIFFICULTY',
  'UNEMPLOYED',
  'BUSINESS_DIFFICULTY',
  'FOOD_INSECURITY',
  'SCHOOL_FEE_DIFFICULTY',
  'HOUSING_DIFFICULTY',
  'DEBT',
]);

export const PhysicalStatusEnum = z.enum([
  'NORMAL',
  'HOSPITALIZED',
  'HOMEBOUND',
  'ELDERLY_CARE_NEEDED',
  'DISABILITY_SUPPORT',
  'RECOVERY',
  'TRANSPORTATION_NEED',
  'PRACTICAL_ASSISTANCE',
]);

export const CreatePastoralAssessmentSchema = z.object({
  memberId: z.string().min(1, 'Member ID required'),
  spiritual: SpiritualStatusEnum,
  social: SocialStatusEnum,
  emotional: EmotionalStatusEnum,
  economic: EconomicStatusEnum,
  physical: PhysicalStatusEnum,
  notes: z.string().optional(),
});

export type CreatePastoralAssessmentDTO = z.infer<
  typeof CreatePastoralAssessmentSchema
>;

// ============================================================================
// PRAYER REQUEST TYPES
// ============================================================================

export const PrayerVisibilityEnum = z.enum([
  'PASTOR_ONLY',
  'SECTION_PASTORAL_TEAM',
  'CHURCH_WIDE',
  'CONFIDENTIAL',
]);

export const SubmitPrayerRequestSchema = z.object({
  request: z.string().min(10, 'Prayer request required'),
  visibility: PrayerVisibilityEnum.default('PASTOR_ONLY'),
});

export type SubmitPrayerRequestDTO = z.infer<typeof SubmitPrayerRequestSchema>;

// ============================================================================
// DASHBOARD TYPES
// ============================================================================

export interface DashboardPriority {
  type: string;
  count: number;
  items: any[];
}

export interface TodaysPriorities {
  visitsScheduled: PastoralVisitSummary[];
  followUpsDue: FollowUpSummary[];
  membershipApprovalsNeeded: MembershipApprovalSummary[];
  hospitalVisitsNeeded: HospitalizationAlertSummary[];
  prayerRequestsNew: PrayerRequestSummary[];
}

export interface PastoralVisitSummary {
  id: string;
  memberId: string;
  memberName: string;
  visitType: string;
  visitDate: Date;
  location?: string;
  purpose: string;
}

export interface FollowUpSummary {
  id: string;
  caseId: string;
  memberId: string;
  memberName: string;
  reason: string;
  dueDate: Date;
  isOverdue: boolean;
}

export interface MembershipApprovalSummary {
  id: string;
  memberId: string;
  memberName: string;
  changeType: string;
  requestedAt: Date;
}

export interface HospitalizationAlertSummary {
  id: string;
  memberId: string;
  memberName: string;
  eventDate: Date;
  status: string;
}

export interface PrayerRequestSummary {
  id: string;
  memberId: string;
  memberName: string;
  visibility: string;
  submittedAt: Date;
}

export interface CongregationalOverview {
  membership: MembershipStats;
  engagement: EngagementStats;
  pastoralCare: PastoralCareStats;
  wellbeing: WellbeingStats;
}

export interface MembershipStats {
  total: number;
  active: number;
  inactive: number;
  newThisMonth: number;
  transfers: number;
  deaths: number;
  baptisms: number;
  confirmations: number;
}

export interface EngagementStats {
  attendanceRate: number;
  communionParticipation: number;
  bibleStudyActive: number;
  sectionParticipation: number;
  organizationParticipation: number;
  volunteerParticipation: number;
}

export interface PastoralCareStats {
  openCases: number;
  highPriorityCases: number;
  overdueFollowUps: number;
  membersNotRecentlyVisited: number;
  membersWithDecliningAttendance: number;
}

export interface WellbeingStats {
  spiritualConcerns: number;
  familyCases: number;
  economicAssistance: number;
  bereavementActive: number;
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

export interface PastoralCaseResponse {
  id: string;
  churchId: string;
  memberId: string;
  category: string;
  concern: string;
  priority: string;
  status: string;
  assignedPastorId?: string;
  openedAt: Date;
  openedBy: string;
  targetFollowUpAt?: Date;
  resolvedAt?: Date;
  resolvedReason?: string;
  closedAt?: Date;
  activityCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PastoralVisitResponse {
  id: string;
  churchId: string;
  memberId: string;
  visitType: string;
  visitedBy: string;
  visitDate: Date;
  location?: string;
  purpose: string;
  observations: string;
  outcome: string;
  followUpRequired: boolean;
  followUpDate?: Date;
  caseId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// AUTHORIZATION TYPES
// ============================================================================

export interface AuthorizedUser {
  id: string;
  churchId: string;
  email: string;
  permissions: string[];
}

export interface UnauthorizedError extends Error {
  statusCode: number;
}
