import { z } from 'zod';

export const StartTermSchema = z
  .object({
    startDate: z.coerce.date().optional(),
    plannedEndDate: z.coerce.date().optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict()
  .refine((v) => !v.plannedEndDate || v.plannedEndDate > (v.startDate ?? new Date()), { message: 'Planned end date must be after the start date', path: ['plannedEndDate'] });

export const EndTermSchema = z
  .object({
    status: z.enum(['COMPLETED', 'TERMINATED']),
    endDate: z.coerce.date().optional(),
    successorId: z.string().min(1).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

export const TermListQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'COMPLETED', 'TERMINATED']).optional(),
  expiringWithinDays: z.coerce.number().int().min(1).max(730).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const AssignmentListQuerySchema = z.object({
  committeeId: z.string().min(1).optional(),
  memberId: z.string().min(1).optional(),
  activeOnly: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type StartTermInput = z.infer<typeof StartTermSchema>;
export type EndTermInput = z.infer<typeof EndTermSchema>;
export type TermListQuery = z.infer<typeof TermListQuerySchema>;
export type AssignmentListQuery = z.infer<typeof AssignmentListQuerySchema>;
