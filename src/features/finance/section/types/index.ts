import { z } from 'zod';

/**
 * Section Finance - Types & Schemas
 *
 * CRITICAL PRINCIPLE:
 * Section finances are completely separate from main church finances.
 * Every section financial entity must carry sectionId to enforce this isolation.
 */

export const CreateSectionFinanceAccountSchema = z.object({
  sectionId: z.string().uuid(),
  churchId: z.string().uuid(),
});

export const CreateSectionReceiptSchema = z.object({
  sectionId: z.string().uuid(),
  memberId: z.string().uuid().optional(),
  incomeType: z.enum(['OFFERING', 'TITHE', 'DONATION', 'FUNDRAISING', 'OTHER']),
  amount: z.number().positive(),
  currency: z.string().default('USD'),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE', 'OTHER']),
  fundId: z.string().uuid().optional(),
  reference: z.string().optional(),
});

export const CreateSectionExpenditureSchema = z.object({
  sectionId: z.string().uuid(),
  amount: z.number().positive(),
  purpose: z.string().min(1),
  expenseCategory: z.string(),
  requestedBy: z.string().uuid(),
  description: z.string().optional(),
  attachments: z.array(z.string()).optional(),
});

export const ApproveSectionExpenditureSchema = z.object({
  expenditureId: z.string().uuid(),
  approved: z.boolean(),
  approverNotes: z.string().optional(),
});

export const SectionFinanceAccountResponseSchema = z.object({
  id: z.string().uuid(),
  sectionId: z.string().uuid(),
  churchId: z.string().uuid(),
  openingBalance: z.number(),
  currentBalance: z.number(),
  currency: z.string(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const SectionReceiptResponseSchema = z.object({
  id: z.string().uuid(),
  sectionId: z.string().uuid(),
  receiptNumber: z.string(),
  memberId: z.string().uuid().nullable(),
  amount: z.number(),
  currency: z.string(),
  incomeType: z.string(),
  paymentMethod: z.string(),
  status: z.enum(['ISSUED', 'VOIDED', 'REVERSED']),
  issuedBy: z.string().uuid(),
  issuedAt: z.string().datetime(),
});

export const SectionExpenditureResponseSchema = z.object({
  id: z.string().uuid(),
  sectionId: z.string().uuid(),
  amount: z.number(),
  purpose: z.string(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID']),
  requestedBy: z.string().uuid(),
  requestedAt: z.string().datetime(),
  approvedBy: z.string().uuid().nullable(),
  approvedAt: z.string().datetime().nullable(),
});

export type CreateSectionFinanceAccountInput = z.infer<typeof CreateSectionFinanceAccountSchema>;
export type CreateSectionReceiptInput = z.infer<typeof CreateSectionReceiptSchema>;
export type CreateSectionExpenditureInput = z.infer<typeof CreateSectionExpenditureSchema>;
export type ApproveSectionExpenditureInput = z.infer<typeof ApproveSectionExpenditureSchema>;
export type SectionFinanceAccountResponse = z.infer<typeof SectionFinanceAccountResponseSchema>;
export type SectionReceiptResponse = z.infer<typeof SectionReceiptResponseSchema>;
export type SectionExpenditureResponse = z.infer<typeof SectionExpenditureResponseSchema>;
