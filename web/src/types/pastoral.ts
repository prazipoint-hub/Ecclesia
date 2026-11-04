export interface CareMember { id: string; firstName: string; lastName: string; membershipNumber?: string | null }
export interface Paged<T> { items: T[]; total: number }

export interface Visit {
  id: string; memberId: string; caseId: string | null; visitType: string; visitedBy: string; visitDate: string; location: string | null;
  purpose: string; observations: string; outcome: string; followUpRequired: boolean; followUpDate: string | null; member?: CareMember;
}

export interface Counseling {
  id: string; memberId: string; caseId: string | null; counselorId: string; counselingType: string; concern: string; intervention: string | null;
  outcome: string; sessionDate: string; hasConfidentialContent: boolean; confidentialNotes?: string | null; followUpPlan?: string | null; member?: CareMember;
}

export interface Prayer {
  id: string; memberId: string; request: string; visibility: string; status: string; submitted: string; closedReason?: string | null; member?: CareMember;
}
export interface WallPrayer { id: string; request: string; submitted: string; firstName: string }

export interface Referral {
  id: string; memberId: string; caseId: string; referralType: string; referredBy: string; providerName: string; reason: string; status: string;
  referralDate: string; followUpDate: string | null; outcome: string | null; notes: string | null; member?: CareMember;
}

export interface FollowUp {
  id: string; memberId: string; caseId: string; dueDate: string; completedAt: string | null; reason: string; notes: string | null;
  status: string; effectiveStatus: string; member?: CareMember;
}

export interface Assessment {
  id: string; memberId: string; spiritual: string; social: string; emotional: string; economic: string; physical: string;
  notes: string | null; assessedAt: string; assessedBy: string;
}

export interface Baptism { id: string; memberId: string; status: string; baptismDate: string | null; baptizedBy: string | null; interviewDate: string | null; member?: CareMember }
export interface Confirmation { id: string; memberId: string; status: string; confirmationDate: string | null; confirmedBy: string | null; member?: CareMember }
export interface Marriage { id: string; status: string; marriageDate: string | null; marriedBy: string | null; partner1: CareMember; partner2: CareMember }
export interface Funeral {
  id: string; deceasedId: string; deathDate: string; funeralDate: string | null; funeralLocation: string | null; funeralBy: string | null;
  familyNotified: boolean; recordedAt: string | null; deceased?: CareMember;
}

export interface PastoralCaseLite { id: string; category: string; concern: string; priority: string; status: string; openedAt: string }

export interface Dashboard {
  openCases: { total: number; byPriority: Record<string, number> };
  priorityCases: Array<PastoralCaseLite & { member?: CareMember }>;
  followUps: { overdue: number; dueThisWeek: FollowUp[] };
  visitsLast30Days: number;
  unvisitedMembers: { thresholdDays: number; count: number; activeMembers: number };
  prayerRequests: Record<string, number>;
  flaggedAssessments: Assessment[];
}

export interface CareProfile {
  member: CareMember;
  cases: PastoralCaseLite[];
  visits: Visit[] | null;
  counseling: Counseling[] | null;
  referrals: Referral[] | null;
  followUps: FollowUp[] | null;
  assessments: Assessment[] | null;
  prayer: Prayer[] | null;
  sacraments: { baptism: Baptism | null; confirmation: Confirmation | null };
  lifeEvents: Array<{ id: string; eventType: string; eventDate: string; description: string }>;
}

export const VISIT_TYPES = ['GENERAL_PASTORAL', 'SICKNESS', 'HOSPITAL', 'BEREAVEMENT', 'FAMILY', 'MARRIAGE', 'NEW_MEMBER', 'INACTIVE_MEMBER', 'ELDERLY', 'BIRTH', 'CELEBRATION', 'FINANCIAL_SUPPORT', 'SPIRITUAL_SUPPORT', 'CRISIS', 'FOLLOW_UP', 'OTHER'];
export const VISIT_OUTCOMES = ['NO_FURTHER_ACTION', 'FOLLOW_UP_REQUIRED', 'COUNSELING_REQUIRED', 'FINANCIAL_ASSISTANCE', 'FAMILY_INTERVENTION', 'REFERRAL', 'PRAYER_SUPPORT'];
export const COUNSELING_TYPES = ['SPIRITUAL', 'PRE_MARITAL', 'MARRIAGE', 'FAMILY', 'GRIEF', 'EMOTIONAL_SUPPORT', 'FINANCIAL', 'CAREER', 'YOUTH', 'CHILD', 'PARENTING', 'LIFE_DECISION', 'CRISIS', 'ADDICTION_SUPPORT', 'BEREAVEMENT', 'OTHER'];
export const COUNSELING_OUTCOMES = ['RESOLVED', 'FOLLOW_UP_REQUIRED', 'ONGOING', 'REFERRED', 'ESCALATED'];
export const PRAYER_VISIBILITY = ['PASTOR_ONLY', 'SECTION_PASTORAL_TEAM', 'CHURCH_WIDE', 'CONFIDENTIAL'];
export const PRAYER_STATUSES = ['NEW', 'BEING_PRAYED_FOR', 'FOLLOW_UP_REQUIRED', 'CLOSED'];
export const REFERRAL_TYPES = ['PROFESSIONAL_COUNSELING', 'MEDICAL', 'FINANCIAL_SUPPORT', 'EMPLOYMENT', 'LEGAL_SUPPORT', 'FAMILY_SUPPORT', 'COMMUNITY_ASSISTANCE', 'OTHER'];
export const REFERRAL_STATUSES = ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'DECLINED', 'AWAITING_RESPONSE'];

/** Mirrors the server's referral workflow; a status with no entry is final. */
export const REFERRAL_NEXT: Record<string, string[]> = {
  PENDING: ['ACCEPTED', 'DECLINED', 'AWAITING_RESPONSE'],
  AWAITING_RESPONSE: ['ACCEPTED', 'DECLINED'],
  ACCEPTED: ['IN_PROGRESS', 'COMPLETED'],
  IN_PROGRESS: ['COMPLETED'],
};

export const ASSESSMENT_DIMENSIONS: Record<'spiritual' | 'social' | 'emotional' | 'economic' | 'physical', string[]> = {
  spiritual: ['HEALTHY', 'STABLE', 'DISENGAGED', 'NEEDS_DISCIPLESHIP', 'FAITH_CRISIS', 'GROWING', 'LEADERSHIP_DEVELOPMENT'],
  social: ['HEALTHY', 'FAMILY_CONFLICT', 'MARRIAGE_DIFFICULTY', 'BEREAVEMENT', 'SOCIAL_ISOLATION', 'PARENTING_CONCERN', 'FAMILY_TRANSITION'],
  emotional: ['NORMAL', 'GRIEF', 'STRESS', 'LONELINESS', 'CRISIS', 'EMOTIONAL_SUPPORT_NEEDED', 'RELATIONSHIP_DIFFICULTY', 'LIFE_TRANSITION'],
  economic: ['SECURE', 'EMPLOYMENT_DIFFICULTY', 'UNEMPLOYED', 'BUSINESS_DIFFICULTY', 'FOOD_INSECURITY', 'SCHOOL_FEE_DIFFICULTY', 'HOUSING_DIFFICULTY', 'DEBT'],
  physical: ['NORMAL', 'HOSPITALIZED', 'HOMEBOUND', 'ELDERLY_CARE_NEEDED', 'DISABILITY_SUPPORT', 'RECOVERY', 'TRANSPORTATION_NEED', 'PRACTICAL_ASSISTANCE'],
};

export const SACRAMENT_ORDER = {
  baptism: ['CANDIDATE', 'IN_PREPARATION', 'INTERVIEWED', 'APPROVED', 'BAPTIZED', 'RECORDED'],
  confirmation: ['CANDIDATE', 'IN_PREPARATION', 'TAUGHT', 'ASSESSED', 'APPROVED', 'CONFIRMED', 'RECORDED'],
  marriage: ['PRE_MARITAL_COUNSELING', 'COUNSELING_COMPLETE', 'APPROVED', 'MARRIED', 'RECORDED'],
} as const;

export const nextSacramentStep = (kind: keyof typeof SACRAMENT_ORDER, status: string): string | null => {
  const order: readonly string[] = SACRAMENT_ORDER[kind];
  const index = order.indexOf(status);
  return index >= 0 && index < order.length - 1 ? order[index + 1] : null;
};
