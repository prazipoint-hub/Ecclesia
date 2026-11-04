export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export const ACCOUNT_TYPES: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

export interface LedgerAccount {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  description: string | null;
  parentId: string | null;
  isActive: boolean;
  isSystem: boolean;
  balance: number;
}

export interface AccountLedger {
  account: { id: string; code: string; name: string; type: AccountType };
  openingBalance: number;
  closingBalance: number;
  truncated: boolean;
  items: Array<{
    entryId: string;
    reference: string;
    description: string;
    memo: string | null;
    postDate: string;
    entryStatus: JournalStatus;
    debit: number;
    credit: number;
    balance: number;
  }>;
}

export interface FinancialPeriod {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: 'OPEN' | 'CLOSED';
  closedAt: string | null;
  closedBy: string | null;
}

export type JournalStatus = 'DRAFT' | 'POSTED' | 'REVERSED';
export type JournalSource = 'MANUAL' | 'RECEIPT' | 'EXPENDITURE' | 'OPENING' | 'REVERSAL';

export interface JournalSummary {
  id: string;
  reference: string;
  description: string;
  postDate: string;
  status: JournalStatus;
  source: JournalSource;
  total: number;
}

export interface JournalList {
  items: JournalSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface JournalLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  memo: string | null;
  fundId: string | null;
}

export interface JournalEntry {
  id: string;
  reference: string;
  description: string;
  postDate: string;
  status: JournalStatus;
  source: JournalSource;
  sourceId: string | null;
  reversesEntryId: string | null;
  reversalReason: string | null;
  createdBy: string;
  postedBy: string | null;
  postedAt: string | null;
  lines: JournalLine[];
}

export interface JournalInput {
  description: string;
  postDate: string;
  lines: Array<{ accountId: string; debit: number; credit: number; memo?: string; fundId?: string }>;
}

export interface SyncResult {
  preview: boolean;
  receipts: number;
  expenditures: number;
  reversed: number;
  blockedByClosedPeriod: number;
  failed: number;
  total: number;
  remaining: number;
}

export interface TrialBalance {
  asOf: string | null;
  rows: Array<{ accountId: string; code: string; name: string; type: AccountType; debit: number; credit: number }>;
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

export interface StatementRow {
  accountId: string;
  code: string;
  name: string;
  amount: number;
}

export interface IncomeStatement {
  from: string | null;
  to: string | null;
  revenue: StatementRow[];
  expenses: StatementRow[];
  totalRevenue: number;
  totalExpenses: number;
  netSurplus: number;
}

export interface BalanceSheet {
  asOf: string | null;
  assets: StatementRow[];
  liabilities: StatementRow[];
  equity: StatementRow[];
  currentSurplus: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  balanced: boolean;
}

export type BudgetStatus = 'DRAFT' | 'APPROVED' | 'CLOSED';

export interface BudgetSummary {
  id: string;
  name: string;
  fiscalYear: number;
  status: BudgetStatus;
  itemCount: number;
  approvedAt: string | null;
}

export interface Budget {
  id: string;
  name: string;
  fiscalYear: number;
  status: BudgetStatus;
  createdBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  items: Array<{ id: string; accountId: string; accountCode: string; accountName: string; type: AccountType; fundId: string | null; amount: number }>;
}

export interface BudgetInput {
  name: string;
  fiscalYear: number;
  items: Array<{ accountId: string; fundId?: string; amount: number }>;
}

export interface BudgetVsActual {
  budget: { id: string; name: string; fiscalYear: number; status: BudgetStatus };
  items: Array<{
    id: string;
    accountId: string;
    accountCode: string;
    accountName: string;
    type: AccountType;
    fundId: string | null;
    budgeted: number;
    actual: number;
    variance: number;
    percentUsed: number;
  }>;
  totals: {
    revenueBudgeted: number;
    revenueActual: number;
    expenseBudgeted: number;
    expenseActual: number;
    surplusBudgeted: number;
    surplusActual: number;
  };
}

export interface FundSummary {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isRestricted: boolean;
  totalReceived: number;
  totalSpent: number;
  balance: number;
}

export interface CashSession {
  id: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  handledBy: string;
  openingBalance: number;
  closedAt: string | null;
  countedBalance: number | null;
  cashPaidOut: number | null;
  expectedBalance: number | null;
  variance: number | null;
  notes: string | null;
}

export interface CurrentCashSession extends CashSession {
  cashReceivedSoFar: number;
  expectedBeforePayouts: number;
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  ASSET: 'Assets',
  LIABILITY: 'Liabilities',
  EQUITY: 'Equity',
  REVENUE: 'Income',
  EXPENSE: 'Expenses',
};
