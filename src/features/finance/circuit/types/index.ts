import { z } from 'zod';

/**
 * CIRCUIT FINANCE TYPES
 *
 * Circuit finances are completely isolated from church finances.
 * Every circuit financial entity carries circuitId to enforce isolation.
 */

export const CreateCircuitFinanceAccountSchema = z.object({
  circuitId: z.string().uuid(),
  openingBalance: z.number().default(0),
  currency: z.string().default('USD'),
});

export const CreateCircuitReceiptSchema = z.object({
  circuitId: z.string().uuid(),
  memberId: z.string().uuid().optional(),
  amount: z.number().positive(),
  incomeType: z.enum(['OFFERING', 'TITHE', 'DONATION', 'FUNDRAISING', 'TRANSFER', 'OTHER']),
  currency: z.string().default('USD'),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE', 'OTHER']),
  reference: z.string().optional(),
  description: z.string().optional(),
});

export const CreateCircuitExpenditureSchema = z.object({
  circuitId: z.string().uuid(),
  amount: z.number().positive(),
  purpose: z.string().min(1),
  expenseCategory: z.string(),
  description: z.string().optional(),
  requestedBy: z.string().uuid(),
  attachments: z.array(z.string()).optional(),
});

export const ApproveCircuitExpenditureSchema = z.object({
  expenditureId: z.string().uuid(),
  approved: z.boolean(),
  approverNotes: z.string().optional(),
});

export type CreateCircuitFinanceAccountInput = z.infer<typeof CreateCircuitFinanceAccountSchema>;
export type CreateCircuitReceiptInput = z.infer<typeof CreateCircuitReceiptSchema>;
export type CreateCircuitExpenditureInput = z.infer<typeof CreateCircuitExpenditureSchema>;
export type ApproveCircuitExpenditureInput = z.infer<typeof ApproveCircuitExpenditureSchema>;
