import { z } from 'zod';

const INCOME_TYPES = ['OFFERING', 'TITHE', 'DONATION', 'FUNDRAISING'] as const;
const amount = z
  .number()
  .positive()
  .max(1_000_000)
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'Amount can have at most two decimal places');
const phone = z.string().trim().regex(/^(0\d{9}|\+?263\d{9})$/, 'Enter a valid Zimbabwean mobile number');

export const InitiatePaymentSchema = z
  .object({
    fundId: z.string().min(1),
    amount,
    incomeType: z.enum(INCOME_TYPES).default('OFFERING'),
    method: z.enum(['ECOCASH', 'ONEMONEY', 'WEB']),
    phone: phone.optional(),
    savedMethodId: z.string().min(1).optional(),
    pledgeId: z.string().min(1).optional(),
  })
  .strict()
  .refine((v) => v.method === 'WEB' || v.phone || v.savedMethodId, { message: 'A phone number or saved payment method is required for mobile money', path: ['phone'] });

export const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED']).optional(),
});

export const CreatePledgeSchema = z
  .object({
    fundId: z.string().min(1),
    name: z.string().trim().min(1).max(120),
    targetAmount: amount,
    endDate: z.coerce.date().optional(),
  })
  .strict();

export const CreateRecurringSchema = z
  .object({
    fundId: z.string().min(1),
    amount,
    incomeType: z.enum(INCOME_TYPES).default('OFFERING'),
    frequency: z.enum(['WEEKLY', 'MONTHLY']),
    method: z.enum(['ECOCASH', 'ONEMONEY']),
    phone,
    startDate: z.coerce.date().optional(),
  })
  .strict();

export const CreateSavedMethodSchema = z
  .object({
    type: z.enum(['ECOCASH', 'ONEMONEY']),
    phone,
    label: z.string().trim().min(1).max(60),
    isDefault: z.boolean().default(false),
  })
  .strict();

export type InitiatePaymentInput = z.infer<typeof InitiatePaymentSchema>;
export type ListQuery = z.infer<typeof ListQuerySchema>;
export type CreatePledgeInput = z.infer<typeof CreatePledgeSchema>;
export type CreateRecurringInput = z.infer<typeof CreateRecurringSchema>;
export type CreateSavedMethodInput = z.infer<typeof CreateSavedMethodSchema>;
