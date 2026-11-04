import { z } from 'zod';

/**
 * DISTRICT FINANCE TYPES
 *
 * District finances are completely isolated from circuit finances.
 * Every district financial entity carries districtId to enforce isolation.
 * In this system, Circuit is the district organizational unit.
 */

export const CreateDistrictFinanceAccountSchema = z.object({
  circuitId: z.string().uuid(),
  openingBalance: z.number().default(0),
  currency: z.string().default('USD'),
});

export const CreateDistrictReceiptSchema = z.object({
  circuitId: z.string().uuid(),
  memberId: z.string().uuid().optional(),
  amount: z.number().positive(),
  incomeType: z.enum(['OFFERING', 'TITHE', 'DONATION', 'FUNDRAISING', 'TRANSFER', 'OTHER']),
  currency: z.string().default('USD'),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE', 'OTHER']),
  reference: z.string().optional(),
  description: z.string().optional(),
});

export const CreateDistrictExpenditureSchema = z.object({
  circuitId: z.string().uuid(),
  amount: z.number().positive(),
  purpose: z.string().min(1),
  expenseCategory: z.string(),
  description: z.string().optional(),
  requestedBy: z.string().uuid(),
  attachments: z.array(z.string()).optional(),
});

export const ApproveDistrictExpenditureSchema = z.object({
  expenditureId: z.string().uuid(),
  approved: z.boolean(),
  approverNotes: z.string().optional(),
});

export type CreateDistrictFinanceAccountInput = z.infer<typeof CreateDistrictFinanceAccountSchema>;
export type CreateDistrictReceiptInput = z.infer<typeof CreateDistrictReceiptSchema>;
export type CreateDistrictExpenditureInput = z.infer<typeof CreateDistrictExpenditureSchema>;
export type ApproveDistrictExpenditureInput = z.infer<typeof ApproveDistrictExpenditureSchema>;
