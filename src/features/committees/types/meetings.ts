import { z } from 'zod';

const nullableText = (max: number) => z.string().trim().max(max).nullable();

export const CreateMeetingSchema = z
  .object({
    title: z.string().trim().min(1).max(150),
    scheduledAt: z.coerce.date(),
    location: z.string().trim().max(200).optional(),
    agenda: z.string().trim().max(10000).optional(),
  })
  .strict();

export const UpdateMeetingSchema = z
  .object({
    title: z.string().trim().min(1).max(150),
    scheduledAt: z.coerce.date(),
    location: nullableText(200),
    agenda: nullableText(10000),
    minutes: nullableText(50000),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

const votes = z.number().int().min(0).max(100000);

export const DecisionSchema = z
  .object({
    description: z.string().trim().min(1).max(5000),
    status: z.enum(['PROPOSED', 'APPROVED', 'REJECTED', 'DEFERRED']).default('PROPOSED'),
    votesFor: votes.default(0),
    votesAgainst: votes.default(0),
    abstentions: votes.default(0),
    ownerMemberId: z.string().min(1).optional(),
    dueDate: z.coerce.date().optional(),
  })
  .strict();

export const UpdateDecisionSchema = z
  .object({
    description: z.string().trim().min(1).max(5000),
    status: z.enum(['PROPOSED', 'APPROVED', 'REJECTED', 'DEFERRED']),
    votesFor: votes,
    votesAgainst: votes,
    abstentions: votes,
    ownerMemberId: z.string().min(1).nullable(),
    dueDate: z.coerce.date().nullable(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const MeetingListQuerySchema = z.object({
  status: z.enum(['SCHEDULED', 'HELD', 'CANCELLED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateMeetingInput = z.infer<typeof CreateMeetingSchema>;
export type UpdateMeetingInput = z.infer<typeof UpdateMeetingSchema>;
export type DecisionInput = z.infer<typeof DecisionSchema>;
export type UpdateDecisionInput = z.infer<typeof UpdateDecisionSchema>;
export type MeetingListQuery = z.infer<typeof MeetingListQuerySchema>;
