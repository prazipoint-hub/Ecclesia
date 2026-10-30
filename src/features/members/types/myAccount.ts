import { z } from 'zod';

const blankToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value);

// .strict() rejects every field a member may not change themselves (status, section, name, ...).
export const UpdateOwnProfileSchema = z
  .object({
    phone: z.preprocess(blankToNull, z.string().trim().max(40).nullable()).optional(),
    address: z.preprocess(blankToNull, z.string().trim().max(500).nullable()).optional(),
    email: z.string().trim().toLowerCase().email().max(190).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

const year = z.coerce.number().int().min(1900).max(2200);

export const GivingListQuerySchema = z.object({
  year: year.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const GivingYearQuerySchema = z.object({ year: year.optional() });

export const NotificationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type UpdateOwnProfileInput = z.infer<typeof UpdateOwnProfileSchema>;
