import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { apiClient } from '@/utils/api';
import { apiError, renderAt, signIn } from '@/test/peopleTestUtils';
import { useAuthStore } from '@stores/authStore';
import { AccountsPage } from './AccountsPage';
import { BudgetDetailPage } from './BudgetDetailPage';
import { CashSessionsPage } from './CashSessionsPage';
import { JournalEditorPage } from './JournalEditorPage';
import { FinanceReportsPage } from './ReportsPage';

vi.mock('@/utils/api', () => ({ apiClient: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock('@/components/Layout/MainLayout', () => ({ MainLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));

const get = vi.mocked(apiClient.get);
const post = vi.mocked(apiClient.post);

const accounts = [
  { id: 'a1', code: '1000', name: 'Cash', type: 'ASSET', description: null, parentId: null, isActive: true, isSystem: false, balance: 0 },
  { id: 'a2', code: '4000', name: 'Tithes', type: 'REVENUE', description: null, parentId: null, isActive: true, isSystem: false, balance: 0 },
  { id: 'a3', code: '9999', name: 'Retired', type: 'EXPENSE', description: null, parentId: null, isActive: false, isSystem: false, balance: 0 },
];

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  useAuthStore.setState({ user: null });
});

const routeGets = (map: Record<string, unknown>) =>
  get.mockImplementation((url: string) => {
    const key = Object.keys(map).find((k) => url.startsWith(k));
    return key ? Promise.resolve({ data: map[key] }) : Promise.reject(new Error(`unmocked ${url}`));
  });

describe('JournalEditorPage', () => {
  const setup = async () => {
    signIn(['finance:view', 'finance:journal:create']);
    routeGets({ '/api/v2/accounting/accounts': accounts, '/api/v2/accounting/funds': [] });
    renderAt('/finance/journals/new', '/finance/journals/new', <JournalEditorPage />);
    await waitFor(() => expect(screen.getAllByText('1000 Cash').length).toBeGreaterThan(0));
  };

  test('shows live totals and keeps Save disabled until balanced', async () => {
    const user = userEvent.setup();
    await setup();
    await user.type(screen.getByLabelText('Description'), 'Offering');
    await user.selectOptions(screen.getByLabelText('Line 1 account'), 'a1');
    await user.selectOptions(screen.getByLabelText('Line 2 account'), 'a2');
    await user.type(screen.getByLabelText('Line 1 debit'), '100');
    expect(screen.getByText('Out of balance by 100.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    await user.type(screen.getByLabelText('Line 2 credit'), '100');
    expect(screen.getByText('Balanced')).toBeInTheDocument();
    expect(screen.getByTestId('total-debit')).toHaveTextContent('100.00');
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled();
  });

  test('rejects a line with both a debit and a credit', async () => {
    const user = userEvent.setup();
    await setup();
    await user.type(screen.getByLabelText('Description'), 'x');
    await user.selectOptions(screen.getByLabelText('Line 1 account'), 'a1');
    await user.selectOptions(screen.getByLabelText('Line 2 account'), 'a2');
    await user.type(screen.getByLabelText('Line 1 debit'), '50');
    await user.type(screen.getByLabelText('Line 1 credit'), '50');
    await user.type(screen.getByLabelText('Line 2 credit'), '0.01');
    expect(screen.getByText('Enter a debit or a credit, not both')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
  });

  test('offers active accounts only', async () => {
    await setup();
    expect(screen.queryByRole('option', { name: /Retired/ })).not.toBeInTheDocument();
  });

  test('surfaces the server message when posting is refused', async () => {
    const user = userEvent.setup();
    signIn(['finance:view', 'finance:journal:create', 'finance:journal:approve']);
    routeGets({
      '/api/v2/accounting/accounts': accounts,
      '/api/v2/accounting/funds': [],
      '/api/v2/accounting/journals/j1': { id: 'j1', reference: 'JE-000001', description: 'Draft', postDate: '2026-04-01', status: 'DRAFT', source: 'MANUAL', sourceId: null, reversesEntryId: null, reversalReason: null, createdBy: 'u1', postedBy: null, postedAt: null, lines: [
        { id: 'l1', accountId: 'a1', accountCode: '1000', accountName: 'Cash', debit: 10, credit: 0, memo: null, fundId: null },
        { id: 'l2', accountId: 'a2', accountCode: '4000', accountName: 'Tithes', debit: 0, credit: 10, memo: null, fundId: null }] },
    });
    post.mockRejectedValue(apiError('A different person must post this entry', 403));
    renderAt('/finance/journals/:journalId', '/finance/journals/j1', <JournalEditorPage />);
    await user.click(await screen.findByRole('button', { name: 'Post entry' }));
    expect(await screen.findByText('A different person must post this entry')).toBeInTheDocument();
  });
});

describe('BudgetDetailPage', () => {
  test('caps progress at 100%, flags overspending red, income overshoot is not red', async () => {
    signIn(['finance:view']);
    const base = { accountId: 'x', fundId: null, variance: 0 };
    routeGets({
      '/api/v2/accounting/budgets/b1/vs-actual': {
        budget: { id: 'b1', name: 'FY26', fiscalYear: 2026, status: 'APPROVED' },
        items: [
          { ...base, id: 'i1', accountCode: '5000', accountName: 'Utilities', type: 'EXPENSE', budgeted: 100, actual: 150, variance: -50, percentUsed: 150 },
          { ...base, id: 'i2', accountCode: '4000', accountName: 'Tithes', type: 'REVENUE', budgeted: 100, actual: 130, variance: 30, percentUsed: 130 },
          { ...base, id: 'i3', accountCode: '5100', accountName: 'Supplies', type: 'EXPENSE', budgeted: 100, actual: 40, variance: 60, percentUsed: 40 },
        ],
        totals: { revenueBudgeted: 100, revenueActual: 130, expenseBudgeted: 200, expenseActual: 190, surplusBudgeted: -100, surplusActual: -60 },
      },
    });
    renderAt('/finance/budgets/:budgetId', '/finance/budgets/b1', <BudgetDetailPage />);
    const utilities = await screen.findByRole('progressbar', { name: 'Utilities used' });
    expect(utilities).toHaveStyle({ width: '100%' });
    expect(utilities.className).toContain('bg-red-500');
    const tithes = screen.getByRole('progressbar', { name: 'Tithes used' });
    expect(tithes).toHaveStyle({ width: '100%' });
    expect(tithes.className).not.toContain('bg-red-500');
    expect(screen.getByRole('progressbar', { name: 'Supplies used' })).toHaveStyle({ width: '40%' });
    expect(screen.getByText('+30.00')).toBeInTheDocument();
  });
});

describe('AccountsPage', () => {
  test('empty chart offers to add the default accounts', async () => {
    const user = userEvent.setup();
    signIn(['finance:view', 'finance:coa:manage']);
    routeGets({ '/api/v2/accounting/accounts': [] });
    post.mockResolvedValue({ data: { added: 20, existing: 0 } });
    renderAt('/finance/accounts', '/finance/accounts', <AccountsPage />);
    await user.click(await screen.findByRole('button', { name: 'Add default chart of accounts' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v2/accounting/accounts/seed-default'));
  });
});

describe('CashSessionsPage', () => {
  test('shows the server message when closing fails', async () => {
    const user = userEvent.setup();
    signIn(['finance:view', 'finance:cash_session:manage']);
    routeGets({
      '/api/v2/accounting/cash-sessions/current': { id: 's1', status: 'OPEN', openedAt: '2026-04-01', handledBy: 'u1', openingBalance: 50, closedAt: null, countedBalance: null, cashPaidOut: null, expectedBalance: null, variance: null, notes: null, cashReceivedSoFar: 200, expectedBeforePayouts: 250 },
      '/api/v2/accounting/cash-sessions': [],
    });
    post.mockRejectedValue(apiError('Notes are required when the count differs from the expected balance'));
    renderAt('/finance/cash-sessions', '/finance/cash-sessions', <CashSessionsPage />);
    await user.type(await screen.findByLabelText('Counted cash'), '240');
    await user.click(screen.getByRole('button', { name: 'Close session' }));
    expect(await screen.findByText('Notes are required when the count differs from the expected balance')).toBeInTheDocument();
  });
});

describe('FinanceReportsPage', () => {
  test('warns loudly when the trial balance is out of balance', async () => {
    signIn(['finance:view']);
    routeGets({ '/api/v2/accounting/reports/trial-balance': { asOf: null, rows: [{ accountId: 'a1', code: '1000', name: 'Cash', type: 'ASSET', debit: 100, credit: 0 }], totalDebit: 100, totalCredit: 90, balanced: false } });
    renderAt('/finance/reports', '/finance/reports', <FinanceReportsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/out of balance/i);
  });

  test('no warning when balanced', async () => {
    signIn(['finance:view']);
    routeGets({ '/api/v2/accounting/reports/trial-balance': { asOf: null, rows: [], totalDebit: 0, totalCredit: 0, balanced: true } });
    renderAt('/finance/reports', '/finance/reports', <FinanceReportsPage />);
    await screen.findByText('Total');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
