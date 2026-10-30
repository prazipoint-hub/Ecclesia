import { z } from 'zod';

/**
 * Main Church Finance Types
 */
export const CreateChurchReceiptSchema = z.object({
  churchId: z.string().min(1),
  memberId: z.string().min(1).optional(),
  fundId: z.string().min(1),
  incomeType: z.enum(['OFFERING', 'TITHE', 'DONATION', 'FUNDRAISING', 'OTHER']),
  amount: z.number().positive(),
  currency: z.string().default('USD'),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE', 'OTHER']),
  reference: z.string().optional(),
});

export const CreateChurchExpenditureSchema = z.object({
  churchId: z.string().min(1),
  fundId: z.string().min(1),
  amount: z.number().positive(),
  purpose: z.string().min(1),
  category: z.string().min(1),
  description: z.string().optional(),
  requestedBy: z.string().min(1),
});

export const ApproveChurchExpenditureSchema = z.object({
  expenditureId: z.string().min(1),
  approved: z.boolean(),
  approverNotes: z.string().optional(),
});

export const ChurchFinanceAccountResponseSchema = z.object({
  id: z.string().min(1),
  churchId: z.string().min(1),
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
