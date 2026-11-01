import { z } from 'zod';

const id = z.string().min(1);
const page = { skip: z.coerce.number().int().min(0).max(100_000).default(0), take: z.coerce.number().int().min(1).max(100).default(25) };
const cost = z.number().min(0).max(100_000_000).refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'At most two decimal places');
const tag = z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Letters, numbers, dot, dash and underscore only');

export const CreateCategorySchema = z.object({ name: z.string().trim().min(2).max(80) }).strict();

export const CreateAssetSchema = z
  .object({
    categoryId: id, tag, name: z.string().trim().min(2).max(150), location: z.string().trim().max(150).optional(), purchaseDate: z.coerce.date().optional(),
    purchaseCost: cost.optional(), serialNumber: z.string().trim().max(100).optional(), notes: z.string().trim().max(2000).optional(),
  })
  .strict();
export const UpdateAssetSchema = z
  .object({
    categoryId: id.optional(), name: z.string().trim().min(2).max(150).optional(), location: z.string().trim().max(150).nullable().optional(), status: z.enum(['ACTIVE', 'IN_REPAIR']).optional(),
    purchaseDate: z.coerce.date().nullable().optional(), purchaseCost: cost.nullable().optional(), serialNumber: z.string().trim().max(100).nullable().optional(), notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export const AssetListQuerySchema = z.object({ q: z.string().trim().max(100).optional(), status: z.enum(['ACTIVE', 'IN_REPAIR', 'RETIRED']).optional(), categoryId: id.optional(), ...page });

export const RecordMaintenanceSchema = z
  .object({ performedOn: z.coerce.date(), description: z.string().trim().min(3).max(1000), cost: cost.optional(), nextDueDate: z.coerce.date().optional() })
  .strict()
  .refine((v) => !v.nextDueDate || v.nextDueDate > v.performedOn, { message: 'The next due date must be after the work date', path: ['nextDueDate'] });
export const DueQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

export type CreateAssetInput = z.infer<typeof CreateAssetSchema>;
export type UpdateAssetInput = z.infer<typeof UpdateAssetSchema>;
export type AssetListQuery = z.infer<typeof AssetListQuerySchema>;
export type RecordMaintenanceInput = z.infer<typeof RecordMaintenanceSchema>;
