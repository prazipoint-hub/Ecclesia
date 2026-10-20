import { z } from 'zod';

/**
 * Main Church Finance Types
 */
export const CreateChurchReceiptSchema = z.object({
  churchId: z.string().uuid(),
  memberId: z.string().uuid().optional(),
  fundId: z.string().uuid(),
  incomeType: z.enum(['OFFERING', 'TITHE', 'DONATION', 'FUNDRAISING', 'OTHER']),
  amount: z.number().positive(),
  currency: z.string().default('USD'),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE', 'OTHER']),
  reference: z.string().optional(),
});

export const CreateChurchExpenditureSchema = z.object({
  churchId: z.string().uuid(),
  fundId: z.string().uuid(),
  amount: z.number().positive(),
  purpose: z.string().min(1),
  category: z.string().min(1),
  description: z.string().optional(),
  requestedBy: z.string().uuid(),
});

export const ApproveChurchExpenditureSchema = z.object({
  expenditureId: z.string().uuid(),
  approved: z.boolean(),
  approverNotes: z.string().optional(),
});

export const ChurchFinanceAccountResponseSchema = z.object({
  id: z.string().uuid(),
  churchId: z.string().uuid(),
  openingBalance: z.number(),
  currentBalance: z.number(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type CreateChurchReceiptInput = z.infer<typeof CreateChurchReceiptSchema>;
export type CreateChurchExpenditureInput = z.infer<typeof CreateChurchExpenditureSchema>;
export type ApproveChurchExpenditureInput = z.infer<typeof ApproveChurchExpenditureSchema>;
export type ChurchFinanceAccountResponse = z.infer<typeof ChurchFinanceAccountResponseSchema>;
