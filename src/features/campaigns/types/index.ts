import { z } from 'zod';

const money = z.number().positive().max(100_000_000).refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'At most two decimal places');

export const CreateCampaignSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    description: z.string().trim().max(5000).optional(),
    goalAmount: money,
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional(),
    isPublic: z.boolean().default(false),
  })
  .strict()
  .refine((v) => !v.endDate || v.endDate > v.startDate, { message: 'End date must be after the start date', path: ['endDate'] });

export const UpdateCampaignSchema = z
  .object({
    name: z.string().trim().min(3).max(120).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    goalAmount: money.optional(),
    endDate: z.coerce.date().nullable().optional(),
    isPublic: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const CampaignListQuerySchema = z.object({
  status: z.enum(['DRAFT', 'ACTIVE', 'CLOSED']).optional(),
  skip: z.coerce.number().int().min(0).max(100_000).default(0),
  take: z.coerce.number().int().min(1).max(100).default(25),
});

export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof UpdateCampaignSchema>;
