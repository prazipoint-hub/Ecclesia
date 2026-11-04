import { z } from 'zod';

const money = z
  .number()
  .positive()
  .max(100_000_000)
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'Amount can have at most two decimal places');

/** Paging for the pending list: bounded integers, so garbage is a 400 rather than NaN reaching the database. */
export const PendingListQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).max(100_000).default(0),
  take: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * CIRCUIT FINANCE TYPES
 *
 * Circuit finances are completely isolated from church finances.
 * Every circuit financial entity carries circuitId to enforce isolation.
 */

export const CreateCircuitFinanceAccountSchema = z.object({
  circuitId: z.string().min(1).max(64),
  openingBalance: z.number().default(0),
  currency: z.string().default('USD'),
});

export const CreateCircuitReceiptSchema = z.object({
  circuitId: z.string().min(1).max(64),
  memberId: z.string().min(1).max(64).optional(),
  amount: money,
  incomeType: z.enum(['OFFERING', 'TITHE', 'DONATION', 'FUNDRAISING', 'TRANSFER', 'OTHER']),
  currency: z.string().default('USD'),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE', 'OTHER']),
  reference: z.string().optional(),
  description: z.string().optional(),
});

export const CreateCircuitExpenditureSchema = z.object({
  circuitId: z.string().min(1).max(64),
  amount: money,
  purpose: z.string().min(1),
  expenseCategory: z.string(),
  description: z.string().optional(),
  attachments: z.array(z.string()).optional(),
});

export const ApproveCircuitExpenditureSchema = z.object({
  expenditureId: z.string().min(1).max(64),
  approved: z.boolean(),
  approverNotes: z.string().optional(),
});

export type CreateCircuitFinanceAccountInput = z.infer<typeof CreateCircuitFinanceAccountSchema>;
export type CreateCircuitReceiptInput = z.infer<typeof CreateCircuitReceiptSchema>;
export type CreateCircuitExpenditureInput = z.infer<typeof CreateCircuitExpenditureSchema>;
export type ApproveCircuitExpenditureInput = z.infer<typeof ApproveCircuitExpenditureSchema>;
