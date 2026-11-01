import { z } from 'zod';

const id = z.string().min(1);
const page = { skip: z.coerce.number().int().min(0).max(100_000).default(0), take: z.coerce.number().int().min(1).max(100).default(25) };
const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
const groupFields = {
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(2000),
  meetingDay: z.enum(DAYS),
  meetingTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:mm'),
  location: z.string().trim().max(200),
  curriculumName: z.string().trim().max(150),
  capacity: z.number().int().min(2).max(500),
};

export const CreateGroupSchema = z
  .object({ name: groupFields.name, description: groupFields.description.optional(), meetingDay: groupFields.meetingDay.optional(), meetingTime: groupFields.meetingTime.optional(), location: groupFields.location.optional(), curriculumName: groupFields.curriculumName.optional(), capacity: groupFields.capacity.optional() })
  .strict();
export const UpdateGroupSchema = z
  .object({
    name: groupFields.name.optional(), description: groupFields.description.nullable().optional(), meetingDay: groupFields.meetingDay.nullable().optional(), meetingTime: groupFields.meetingTime.nullable().optional(),
    location: groupFields.location.nullable().optional(), curriculumName: groupFields.curriculumName.nullable().optional(), capacity: groupFields.capacity.nullable().optional(), status: z.enum(['ACTIVE', 'PAUSED', 'CLOSED']).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export const GroupListQuerySchema = z.object({ q: z.string().trim().max(100).optional(), status: z.enum(['ACTIVE', 'PAUSED', 'CLOSED']).optional(), ...page });

export const AddMemberSchema = z.object({ memberId: id, role: z.enum(['LEADER', 'MEMBER']).default('MEMBER') }).strict();
export const SetMemberRoleSchema = z.object({ role: z.enum(['LEADER', 'MEMBER']) }).strict();

const attendanceList = z.array(z.object({ membershipId: id, present: z.boolean() }).strict()).max(500);
export const CreateSessionSchema = z
  .object({ heldOn: z.coerce.date(), topic: z.string().trim().min(2).max(200), lesson: z.string().trim().max(200).optional(), notes: z.string().trim().max(5000).optional(), attendance: attendanceList.default([]) })
  .strict();
export const SetAttendanceSchema = z.object({ attendance: attendanceList }).strict();
export const SessionListQuerySchema = z.object({ ...page });

export type CreateGroupInput = z.infer<typeof CreateGroupSchema>;
export type UpdateGroupInput = z.infer<typeof UpdateGroupSchema>;
export type GroupListQuery = z.infer<typeof GroupListQuerySchema>;
export type CreateSessionInput = z.infer<typeof CreateSessionSchema>;
