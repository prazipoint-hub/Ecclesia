import { z } from 'zod';

const STATUSES = ['NEW', 'CONTACTED', 'SCHEDULED', 'JOINED', 'NOT_INTERESTED'] as const;
const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const text = (max: number) => z.preprocess(blank, z.string().trim().max(max).optional());

export const CreateVisitorSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    phone: text(30),
    email: z.preprocess((v) => (typeof v === 'string' ? blank(v.trim().toLowerCase()) : v), z.string().email().max(190).optional()),
    visitDate: z.coerce.date().optional(),
    source: text(100),
    notes: text(5000),
    assignedToId: z.string().min(1).optional(),
  })
  .strict();

export const UpdateVisitorSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    phone: z.string().trim().max(30).nullable(),
    email: z.string().trim().toLowerCase().email().max(190).nullable(),
    source: z.string().trim().max(100).nullable(),
    notes: z.string().trim().max(5000).nullable(),
    assignedToId: z.string().min(1).nullable(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const FollowUpSchema = z
  .object({
    method: z.enum(['CALL', 'VISIT', 'MESSAGE', 'OTHER']),
    notes: text(5000),
    status: z.enum(['CONTACTED', 'SCHEDULED', 'NOT_INTERESTED']).optional(),
  })
  .strict();

export const ConvertSchema = z
  .object({
    sectionId: z.string().min(1).optional(),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
    dateOfBirth: z.coerce.date().max(new Date(), 'Date of birth cannot be in the future').optional(),
  })
  .strict();

export const VisitorListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(STATUSES).optional(),
  assignedToId: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type CreateVisitorInput = z.infer<typeof CreateVisitorSchema>;
export type UpdateVisitorInput = z.infer<typeof UpdateVisitorSchema>;
export type FollowUpInput = z.infer<typeof FollowUpSchema>;
export type ConvertInput = z.infer<typeof ConvertSchema>;
export type VisitorListQuery = z.infer<typeof VisitorListQuerySchema>;
