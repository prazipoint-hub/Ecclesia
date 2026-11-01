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
 * Section Finance - Types & Schemas
 *
 * CRITICAL PRINCIPLE:
 * Section finances are completely separate from main church finances.
 * Every section financial entity must carry sectionId to enforce this isolation.
 */

export const CreateSectionFinanceAccountSchema = z.object({
  sectionId: z.string().min(1).max(64),
  churchId: z.string().min(1).max(64),
});

export const CreateSectionReceiptSchema = z.object({
  sectionId: z.string().min(1).max(64),
  memberId: z.string().min(1).max(64).optional(),
  incomeType: z.enum(['OFFERING', 'TITHE', 'DONATION', 'FUNDRAISING', 'OTHER']),
  amount: money,
  currency: z.string().default('USD'),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE', 'OTHER']),
  fundId: z.string().min(1).max(64).optional(),
  reference: z.string().optional(),
});

export const CreateSectionExpenditureSchema = z.object({
  sectionId: z.string().min(1).max(64),
  amount: money,
  purpose: z.string().min(1),
  expenseCategory: z.string(),
  description: z.string().optional(),
  attachments: z.array(z.string()).optional(),
});

export const ApproveSectionExpenditureSchema = z.object({
  expenditureId: z.string().min(1).max(64),
  approved: z.boolean(),
  approverNotes: z.string().optional(),
});

export const SectionFinanceAccountResponseSchema = z.object({
  id: z.string().min(1).max(64),
  sectionId: z.string().min(1).max(64),
  churchId: z.string().min(1).max(64),
  openingBalance: z.number(),
  currentBalance: z.number(),
  currency: z.string(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const SectionReceiptResponseSchema = z.object({
  id: z.string().min(1).max(64),
  sectionId: z.string().min(1).max(64),
  receiptNumber: z.string(),
  memberId: z.string().min(1).max(64).nullable(),
  amount: z.number(),
  currency: z.string(),
  incomeType: z.string(),
  paymentMethod: z.string(),
  status: z.enum(['ISSUED', 'VOIDED', 'REVERSED']),
  issuedBy: z.string().min(1).max(64),
  issuedAt: z.string().datetime(),
});

export const SectionExpenditureResponseSchema = z.object({
  id: z.string().min(1).max(64),
  sectionId: z.string().min(1).max(64),
  amount: z.number(),
  purpose: z.string(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID']),
  requestedBy: z.string().min(1).max(64),
  requestedAt: z.string().datetime(),
  approvedBy: z.string().min(1).max(64).nullable(),
  approvedAt: z.string().datetime().nullable(),
});

export type CreateSectionFinanceAccountInput = z.infer<typeof CreateSectionFinanceAccountSchema>;
export type CreateSectionReceiptInput = z.infer<typeof CreateSectionReceiptSchema>;
export type CreateSectionExpenditureInput = z.infer<typeof CreateSectionExpenditureSchema>;
export type ApproveSectionExpenditureInput = z.infer<typeof ApproveSectionExpenditureSchema>;
export type SectionFinanceAccountResponse = z.infer<typeof SectionFinanceAccountResponseSchema>;
export type SectionReceiptResponse = z.infer<typeof SectionReceiptResponseSchema>;
export type SectionExpenditureResponse = z.infer<typeof SectionExpenditureResponseSchema>;
