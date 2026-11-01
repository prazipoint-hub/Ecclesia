import { z } from 'zod';

const id = z.string().min(1);
const page = {
  skip: z.coerce.number().int().min(0).max(100_000).default(0),
  take: z.coerce.number().int().min(1).max(200).default(50),
};

// ------------------------------------------------------------------- QR / check-in
export const SelfCheckInSchema = z.object({ token: z.string().min(20).max(2000) });
export const ScanBadgeSchema = z.object({ token: z.string().min(20).max(2000) });
export const ManualCheckInSchema = z
  .object({
    memberId: id.optional(),
    membershipNumber: z.string().trim().min(1).max(50).optional(),
    method: z.enum(['MANUAL', 'KIOSK']).default('MANUAL'),
  })
  .refine((v) => Boolean(v.memberId) !== Boolean(v.membershipNumber), { message: 'Give either memberId or membershipNumber' });
export const CheckInListQuerySchema = z.object({ ...page });

// ------------------------------------------------------------------- registration
export const GuestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(190).optional(),
  phone: z.string().trim().max(40).optional(),
});
export const StaffRegistrationSchema = z
  .object({ memberId: id.optional(), guest: GuestSchema.optional() })
  .refine((v) => Boolean(v.memberId) !== Boolean(v.guest), { message: 'Give either memberId or guest details' });
export const RegistrationListQuerySchema = z.object({ status: z.enum(['REGISTERED', 'CANCELLED']).optional(), ...page });

// ------------------------------------------------------------------- volunteers
export const VolunteerStatusEnum = z.enum(['ASSIGNED', 'CONFIRMED', 'DECLINED', 'COMPLETED', 'NO_SHOW', 'CANCELLED']);
export const CreateVolunteerSchema = z.object({
  eventId: id,
  memberId: id,
  role: z.string().trim().min(2).max(80),
  notes: z.string().trim().max(2000).optional(),
});
export const UpdateVolunteerSchema = z.object({
  status: z.enum(['COMPLETED', 'NO_SHOW', 'CANCELLED']).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export const RespondVolunteerSchema = z.object({ response: z.enum(['CONFIRMED', 'DECLINED']) });
export const VolunteerListQuerySchema = z.object({
  eventId: id.optional(),
  memberId: id.optional(),
  status: VolunteerStatusEnum.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  ...page,
});

// ------------------------------------------------------------------- analytics
export const AnalyticsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  eventType: z.string().trim().min(2).max(80).optional(),
  sectionId: id.optional(),
});

// ------------------------------------------------------------------- absences
export const DetectAbsencesSchema = z.object({
  eventType: z.string().trim().min(2).max(80).default('SERVICE'),
  threshold: z.coerce.number().int().min(2).max(12).default(3),
  dryRun: z.boolean().default(false),
});
export const AbsenceListQuerySchema = z.object({
  status: z.enum(['OPEN', 'CONTACTED', 'RESOLVED', 'DISMISSED']).optional(),
  assignedTo: id.optional(),
  ...page,
});
export const AssignAbsenceSchema = z.object({ assignedTo: id });
export const UpdateAbsenceSchema = z.object({
  status: z.enum(['CONTACTED', 'RESOLVED', 'DISMISSED']),
  notes: z.string().trim().max(4000).optional(),
});

export type ManualCheckInInput = z.infer<typeof ManualCheckInSchema>;
export type StaffRegistrationInput = z.infer<typeof StaffRegistrationSchema>;
export type CreateVolunteerInput = z.infer<typeof CreateVolunteerSchema>;
export type UpdateVolunteerInput = z.infer<typeof UpdateVolunteerSchema>;
export type VolunteerListQuery = z.infer<typeof VolunteerListQuerySchema>;
export type AnalyticsQuery = z.infer<typeof AnalyticsQuerySchema>;
export type DetectAbsencesInput = z.infer<typeof DetectAbsencesSchema>;
export type UpdateAbsenceInput = z.infer<typeof UpdateAbsenceSchema>;
