import { z } from 'zod';
import {
  CreatePastoralAssessmentSchema,
  CreatePastoralVisitSchema,
  PrayerVisibilityEnum,
  VisitOutcomeEnum,
} from '../../types';

const id = z.string().min(1);
const page = {
  skip: z.coerce.number().int().min(0).max(100_000).default(0),
  take: z.coerce.number().int().min(1).max(100).default(20),
};

// ------------------------------------------------------------------ visits
export const CreateVisitSchema = CreatePastoralVisitSchema;
export const UpdateVisitSchema = z.object({
  outcome: VisitOutcomeEnum.optional(),
  observations: z.string().min(20).optional(),
  followUpRequired: z.boolean().optional(),
  followUpDate: z.coerce.date().nullable().optional(),
});
export const VisitListQuerySchema = z.object({ memberId: id.optional(), caseId: id.optional(), ...page });

// -------------------------------------------------------------- counseling
export const CounselingTypeEnum = z.enum([
  'SPIRITUAL', 'PRE_MARITAL', 'MARRIAGE', 'FAMILY', 'GRIEF', 'EMOTIONAL_SUPPORT', 'FINANCIAL', 'CAREER', 'YOUTH', 'CHILD',
  'PARENTING', 'LIFE_DECISION', 'CRISIS', 'ADDICTION_SUPPORT', 'BEREAVEMENT', 'OTHER',
]);
export const CounselingOutcomeEnum = z.enum(['RESOLVED', 'FOLLOW_UP_REQUIRED', 'ONGOING', 'REFERRED', 'ESCALATED']);
export const CreateCounselingSchema = z.object({
  memberId: id,
  caseId: id.optional(),
  counselingType: CounselingTypeEnum,
  concern: z.string().min(10),
  intervention: z.string().optional(),
  outcome: CounselingOutcomeEnum,
  sessionDate: z.coerce.date(),
  confidentialNotes: z.string().optional(),
  followUpPlan: z.string().optional(),
});
export const UpdateCounselingSchema = z.object({
  intervention: z.string().optional(),
  outcome: CounselingOutcomeEnum.optional(),
  confidentialNotes: z.string().nullable().optional(),
  followUpPlan: z.string().nullable().optional(),
});
export const CounselingListQuerySchema = z.object({ memberId: id.optional(), caseId: id.optional(), ...page });

// ------------------------------------------------------------------ prayer
export const SubmitPrayerSchema = z.object({
  request: z.string().min(10).max(4000),
  visibility: PrayerVisibilityEnum.default('PASTOR_ONLY'),
});
export const PrayerStatusEnum = z.enum(['NEW', 'BEING_PRAYED_FOR', 'FOLLOW_UP_REQUIRED', 'CLOSED']);
export const UpdatePrayerSchema = z.object({
  status: PrayerStatusEnum,
  closedReason: z.string().min(3).optional(),
});
export const PrayerListQuerySchema = z.object({ status: PrayerStatusEnum.optional(), memberId: id.optional(), ...page });
export const PrayerDetailQuerySchema = z.object({ justification: z.string().min(10).optional() });

// --------------------------------------------------------------- referrals
export const ReferralTypeEnum = z.enum([
  'PROFESSIONAL_COUNSELING', 'MEDICAL', 'FINANCIAL_SUPPORT', 'EMPLOYMENT', 'LEGAL_SUPPORT', 'FAMILY_SUPPORT', 'COMMUNITY_ASSISTANCE', 'OTHER',
]);
export const ReferralStatusEnum = z.enum(['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'DECLINED', 'AWAITING_RESPONSE']);
export const CreateReferralSchema = z.object({
  caseId: id,
  referralType: ReferralTypeEnum,
  providerName: z.string().min(2),
  reason: z.string().min(10),
  followUpDate: z.coerce.date().optional(),
  notes: z.string().optional(),
});
export const UpdateReferralSchema = z.object({
  status: ReferralStatusEnum.optional(),
  outcome: z.string().optional(),
  notes: z.string().optional(),
  followUpDate: z.coerce.date().nullable().optional(),
});
export const ReferralListQuerySchema = z.object({ status: ReferralStatusEnum.optional(), caseId: id.optional(), memberId: id.optional(), ...page });

// --------------------------------------------------------------- follow-ups
export const CreateFollowUpSchema = z.object({
  caseId: id,
  dueDate: z.coerce.date(),
  reason: z.string().min(5),
  notes: z.string().optional(),
});
export const CompleteFollowUpSchema = z.object({ notes: z.string().optional() });
export const FollowUpListQuerySchema = z.object({
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED', 'OVERDUE']).optional(),
  caseId: id.optional(),
  memberId: id.optional(),
  ...page,
});

// ------------------------------------------------------------- assessments
export const CreateAssessmentSchema = CreatePastoralAssessmentSchema;
export const AssessmentListQuerySchema = z.object({ memberId: id, ...page });

// --------------------------------------------------------------- sacraments
export const SacramentListQuerySchema = z.object({ status: z.string().optional(), memberId: id.optional(), ...page });
export const CreateBaptismSchema = z.object({ memberId: id, preparationNotes: z.string().optional() });
export const AdvanceBaptismSchema = z.object({
  status: z.enum(['IN_PREPARATION', 'INTERVIEWED', 'APPROVED', 'BAPTIZED', 'RECORDED']),
  preparationNotes: z.string().optional(),
  interviewDate: z.coerce.date().optional(),
  baptismDate: z.coerce.date().optional(),
  baptizedBy: z.string().optional(),
  location: z.string().optional(),
  witnesses: z.string().optional(),
});
export const CreateConfirmationSchema = z.object({ memberId: id, preparationNotes: z.string().optional() });
export const AdvanceConfirmationSchema = z.object({
  status: z.enum(['IN_PREPARATION', 'TAUGHT', 'ASSESSED', 'APPROVED', 'CONFIRMED', 'RECORDED']),
  preparationNotes: z.string().optional(),
  teachingNotes: z.string().optional(),
  assessmentNotes: z.string().optional(),
  confirmationDate: z.coerce.date().optional(),
  confirmedBy: z.string().optional(),
  location: z.string().optional(),
});
export const CreateMarriageSchema = z.object({ partner1Id: id, partner2Id: id, counselorId: id.optional(), premaritalCounselingNotes: z.string().optional() });
export const AdvanceMarriageSchema = z.object({
  status: z.enum(['COUNSELING_COMPLETE', 'APPROVED', 'MARRIED', 'RECORDED']),
  premaritalCounselingNotes: z.string().optional(),
  marriageDate: z.coerce.date().optional(),
  marriedBy: z.string().optional(),
  location: z.string().optional(),
  witnesses: z.string().optional(),
});
export const CreateFuneralSchema = z.object({
  deceasedId: id,
  deathDate: z.coerce.date(),
  deathLocation: z.string().optional(),
  funeralDate: z.coerce.date().optional(),
  funeralLocation: z.string().optional(),
  funeralBy: z.string().optional(),
});
export const UpdateFuneralSchema = z.object({
  funeralDate: z.coerce.date().optional(),
  funeralLocation: z.string().optional(),
  funeralBy: z.string().optional(),
  familyNotified: z.boolean().optional(),
  record: z.boolean().optional(),
});

export type CreateVisitInput = z.infer<typeof CreateVisitSchema>;
export type UpdateVisitInput = z.infer<typeof UpdateVisitSchema>;
export type CreateCounselingInput = z.infer<typeof CreateCounselingSchema>;
export type UpdateCounselingInput = z.infer<typeof UpdateCounselingSchema>;
export type SubmitPrayerInput = z.infer<typeof SubmitPrayerSchema>;
export type UpdatePrayerInput = z.infer<typeof UpdatePrayerSchema>;
export type CreateReferralInput = z.infer<typeof CreateReferralSchema>;
export type UpdateReferralInput = z.infer<typeof UpdateReferralSchema>;
export type CreateFollowUpInput = z.infer<typeof CreateFollowUpSchema>;
export type CreateAssessmentInput = z.infer<typeof CreateAssessmentSchema>;
export type CreateFuneralInput = z.infer<typeof CreateFuneralSchema>;
export type UpdateFuneralInput = z.infer<typeof UpdateFuneralSchema>;
