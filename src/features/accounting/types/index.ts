import { z } from 'zod';

export const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

const id = z.string().min(1).max(64);
const money = z
  .number()
  .min(0)
  .max(1_000_000_000)
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'At most two decimal places');
const positiveMoney = money.refine((v) => v > 0, 'Must be greater than zero');
const note = (max: number) => z.string().trim().min(1).max(max);
const day = z.coerce.date();

// ---- chart of accounts
export const CreateAccountSchema = z
  .object({
    code: z.string().trim().regex(/^[0-9A-Za-z.-]{1,20}$/, 'Use letters, digits, dots or dashes (max 20)'),
    name: note(120),
    type: z.enum(ACCOUNT_TYPES),
    description: note(300).optional(),
    parentId: id.optional(),
  })
  .strict();
export const UpdateAccountSchema = z
  .object({ name: note(120), description: z.string().trim().max(300).nullable(), isActive: z.boolean() })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

// ---- periods
export const CreatePeriodSchema = z.object({ name: note(60), startDate: day, endDate: day }).strict();
export const ReopenPeriodSchema = z.object({ reason: note(500) }).strict();

// ---- journals
const JournalLineSchema = z
  .object({ accountId: id, debit: money.default(0), credit: money.default(0), memo: note(200).optional(), fundId: id.optional() })
  .strict()
  .refine((l) => (l.debit > 0) !== (l.credit > 0), 'A line must have either a debit or a credit, not both and not neither');
export const JournalSchema = z
  .object({ description: note(300), postDate: day, lines: z.array(JournalLineSchema).min(2).max(100) })
  .strict();
export const ReverseSchema = z.object({ reason: note(500), postDate: day.optional() }).strict();
export const VoidReceiptSchema = z.object({ reason: note(500) }).strict();

export const JournalListQuerySchema = z.object({
  status: z.enum(['DRAFT', 'POSTED', 'REVERSED']).optional(),
  source: z.enum(['MANUAL', 'RECEIPT', 'EXPENDITURE', 'OPENING', 'REVERSAL']).optional(),
  accountId: id.optional(),
  from: day.optional(),
  to: day.optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const SyncSchema = z.object({ preview: z.boolean().default(false) }).strict();

export const OpeningBalanceSchema = z
  .object({ asOf: day, balances: z.array(z.object({ accountId: id, amount: positiveMoney }).strict()).min(1).max(200) })
  .strict();

// ---- reports
export const ReportQuerySchema = z.object({ from: day.optional(), to: day.optional(), asOf: day.optional() });
export const LedgerQuerySchema = z.object({ from: day.optional(), to: day.optional() });

// ---- budgets
const BudgetItemSchema = z.object({ accountId: id, fundId: id.optional(), amount: positiveMoney }).strict();
export const CreateBudgetSchema = z
  .object({ name: note(100), fiscalYear: z.number().int().min(2000).max(2100), items: z.array(BudgetItemSchema).min(1).max(300) })
  .strict();
export const UpdateBudgetSchema = CreateBudgetSchema.partial().strict().refine((v) => Object.keys(v).length > 0, 'Nothing to update');

// ---- funds
export const CreateFundSchema = z.object({ name: note(100), description: note(300).optional(), isRestricted: z.boolean().default(false) }).strict();
export const UpdateFundSchema = z
  .object({ name: note(100), description: z.string().trim().max(300).nullable(), isRestricted: z.boolean(), isActive: z.boolean() })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

// ---- cash sessions
export const OpenCashSessionSchema = z.object({ openingBalance: money }).strict();
export const CloseCashSessionSchema = z.object({ countedBalance: money, cashPaidOut: money.default(0), notes: z.string().trim().max(1000).optional() }).strict();

export type CreateAccountInput = z.infer<typeof CreateAccountSchema>;
export type UpdateAccountInput = z.infer<typeof UpdateAccountSchema>;
export type CreatePeriodInput = z.infer<typeof CreatePeriodSchema>;
export type JournalInput = z.infer<typeof JournalSchema>;
export type ReverseInput = z.infer<typeof ReverseSchema>;
export type JournalListQuery = z.infer<typeof JournalListQuerySchema>;
export type OpeningBalanceInput = z.infer<typeof OpeningBalanceSchema>;
export type CreateBudgetInput = z.infer<typeof CreateBudgetSchema>;
export type UpdateBudgetInput = z.infer<typeof UpdateBudgetSchema>;
export type CreateFundInput = z.infer<typeof CreateFundSchema>;
export type UpdateFundInput = z.infer<typeof UpdateFundSchema>;
export type CloseCashSessionInput = z.infer<typeof CloseCashSessionSchema>;
