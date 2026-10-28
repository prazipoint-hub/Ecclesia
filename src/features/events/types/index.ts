import { z } from 'zod';

export const EventStatusSchema = z.enum(['SCHEDULED', 'ONGOING', 'COMPLETED', 'CANCELLED']);
export const AttendanceStatusSchema = z.enum(['PRESENT', 'ABSENT', 'EXCUSED', 'UNCONFIRMED']);

export const CreateEventSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(5000).optional(),
  eventType: z.string().trim().min(2).max(80),
  startDateTime: z.coerce.date(),
  endDateTime: z.coerce.date().optional(),
  location: z.string().trim().max(200).optional(),
  sectionId: z.string().min(1).optional(),
  organizationId: z.string().min(1).optional(),
  expectedAttendance: z.coerce.number().int().min(0).max(1_000_000).optional(),
});

export const UpdateEventSchema = CreateEventSchema.partial().extend({
  status: EventStatusSchema.optional(),
});

export const RecordAttendanceSchema = z.object({
  memberId: z.string().min(1),
  status: AttendanceStatusSchema.default('PRESENT'),
  arrivedAt: z.coerce.date().optional(),
});

export type CreateEventDTO = z.infer<typeof CreateEventSchema>;
export type UpdateEventDTO = z.infer<typeof UpdateEventSchema>;
export type RecordAttendanceDTO = z.infer<typeof RecordAttendanceSchema>;
