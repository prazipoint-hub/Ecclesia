import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { apiClient } from '@/utils/api';
import { renderAt, signIn } from '@/test/peopleTestUtils';
import { useAuthStore } from '@stores/authStore';
import { BankReconciliationPage, parseStatement } from './BankReconciliationPage';

vi.mock('@/utils/api', () => ({ apiClient: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock('@/components/Layout/MainLayout', () => ({ MainLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
const get = vi.mocked(apiClient.get);
const post = vi.mocked(apiClient.post);
beforeEach(() => { get.mockReset(); post.mockReset(); useAuthStore.setState({ user: null }); });

describe('parseStatement', () => {
  test('reads rows, skips a header, and reports bad rows', () => {
    const r = parseStatement('date,description,reference,amount\n2026-03-02,DEPOSIT,SLIP1,1000\n2026-03-05,FEE,,-12.50\nnot a row');
    expect(r.lines).toEqual([{ date: '2026-03-02', description: 'DEPOSIT', reference: 'SLIP1', amount: 1000 }, { date: '2026-03-05', description: 'FEE', amount: -12.5 }]);
    expect(r.errors).toHaveLength(1);
  });
  test('rejects zero amounts and bad dates', () => {
    expect(parseStatement('2026-03-02,X,,0\n03/02/2026,Y,,5').errors).toHaveLength(2);
  });
});

const head = { id: 'r1', currency: 'USD', periodStart: '2026-03-01T00:00:00Z', periodEnd: '2026-03-31T00:00:00Z', statementClosing: '900.00', status: 'DRAFT', createdBy: 'u1' };
const detail = {
  ...head, summary: { statementClosing: '900.00', ledgerBalance: '1300.00', unmatchedStatementCount: 1, unmatchedStatementNet: '-100.00', unmatchedLedgerCount: 1, unmatchedLedgerNet: '300.00', adjustedBank: '1200.00', adjustedBook: '1200.00', difference: '0.00' },
  statementLines: [{ id: 'l1', lineDate: '2026-03-05T00:00:00Z', description: 'FEE', reference: null, amount: '-100.00', status: 'UNMATCHED' }],
  unmatchedBook: [{ journalLineId: 'b1', date: '2026-03-06T00:00:00Z', reference: 'JE-1', description: 'Deposit', amount: '300.00' }],
};

describe('bank reconciliation page', () => {
  test('shows the difference and only offers ledger lines with the same amount', async () => {
    signIn(['finance:view', 'finance:reconcile:manage', 'finance:reconcile:complete']);
    get.mockImplementation((url: string) => Promise.resolve({ data: url.endsWith('/r1') ? detail : { reconciliations: [head] } }));
    renderAt('/finance/reconciliation', '/finance/reconciliation', <BankReconciliationPage />);
    await userEvent.click(await screen.findByRole('button', { name: /2026-03-01 to 2026-03-31/ }));
    expect(await screen.findByText('Difference')).toBeInTheDocument();
    expect(screen.getAllByText('0.00').length).toBeGreaterThan(0);
    expect(screen.getByText(/No ledger line with this exact amount/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Complete reconciliation' })).toBeEnabled();
  });

  test('complete is disabled while the books do not balance', async () => {
    signIn(['finance:view', 'finance:reconcile:complete']);
    get.mockImplementation((url: string) => Promise.resolve({ data: url.endsWith('/r1') ? { ...detail, summary: { ...detail.summary, difference: '50.00' } } : { reconciliations: [head] } }));
    renderAt('/finance/reconciliation', '/finance/reconciliation', <BankReconciliationPage />);
    await userEvent.click(await screen.findByRole('button', { name: /2026-03-01 to 2026-03-31/ }));
    expect(await screen.findByRole('button', { name: 'Complete reconciliation' })).toBeDisabled();
  });
});
