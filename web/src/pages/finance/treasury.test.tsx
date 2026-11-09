import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { apiClient } from '@/utils/api';
import { renderAt, signIn } from '@/test/peopleTestUtils';
import { useAuthStore } from '@stores/authStore';
import { CashReviewPage } from './CashReviewPage';
import { DepositsPage } from './DepositsPage';
import { ProfileCompletionPage } from '@/pages/account/ProfileCompletionPage';

vi.mock('@/utils/api', () => ({ apiClient: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock('@/components/Layout/MainLayout', () => ({ MainLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));

const get = vi.mocked(apiClient.get);
const post = vi.mocked(apiClient.post);
const routeGets = (map: Record<string, unknown>) =>
  get.mockImplementation((url: string) => {
    const key = Object.keys(map).sort((a, b) => b.length - a.length).find((k) => url.startsWith(k));
    return key ? Promise.resolve({ data: map[key] }) : Promise.reject(new Error(`unmocked ${url}`));
  });

beforeEach(() => { get.mockReset(); post.mockReset(); useAuthStore.setState({ user: null }); });

const detail = {
  id: 's1', status: 'SUBMITTED', cashier: 'm9', submissionNo: 2, submittedAt: null, reviewedAt: null, reviewNote: null,
  submission: { counts: [{ currency: 'USD', counted: 150 }, { currency: 'ZWG', counted: 30 }], cashPaidOut: 0, notes: null, variances: {} },
  snapshot: { expected: { USD: '150.00', ZWG: '30.00' }, cashReceipts: {}, other: { 'MOBILE_MONEY:USD': '40.00' }, categories: {}, receiptCount: 3 },
  live: { expected: {}, cashReceipts: {}, other: {}, receiptCount: 3 }, changedSinceSubmission: false, receipts: [], history: [],
};

describe('CashReviewPage', () => {
  test('without the review permission nothing is requested', () => {
    signIn(['finance:view']);
    renderAt('/finance/cash-review', '/finance/cash-review', <CashReviewPage />);
    expect(get).not.toHaveBeenCalled();
  });

  test('own sessions cannot be opened; approval needs the reviewer to type every currency and sends submissionNo', async () => {
    const user = userEvent.setup();
    signIn(['finance:view', 'finance:cash_session:review']);
    routeGets({
      '/api/v2/accounting/cash-sessions/review-queue': { sessions: [
        { id: 's1', cashier: 'm9', submittedAt: null, submissionNo: 2, expected: { USD: '150.00' }, receiptCount: 3, discrepancy: false, ownSession: false },
        { id: 's2', cashier: 'me', submittedAt: null, submissionNo: 1, expected: { USD: '10.00' }, receiptCount: 1, discrepancy: false, ownSession: true },
      ] },
      '/api/v2/accounting/cash-sessions/s1/detail': detail,
    });
    post.mockResolvedValue({ data: {} });
    renderAt('/finance/cash-review', '/finance/cash-review', <CashReviewPage />);
    const buttons = await screen.findAllByRole('button', { name: 'Review' });
    expect(buttons[1]).toBeDisabled();
    await user.click(buttons[0]);
    const approve = await screen.findByRole('button', { name: 'Approve handover' });
    expect(approve).toBeDisabled();
    await user.type(screen.getByLabelText('Cash received (USD)'), '150');
    expect(approve).toBeDisabled(); // ZWG still missing
    await user.type(screen.getByLabelText('Cash received (ZWG)'), '30');
    expect(approve).toBeEnabled();
    await user.click(approve);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v2/accounting/cash-sessions/s1/approve', { submissionNo: 2, received: [{ currency: 'USD', amount: 150 }, { currency: 'ZWG', amount: 30 }] }));
  });

  test('a stale snapshot is called out', async () => {
    const user = userEvent.setup();
    signIn(['finance:view', 'finance:cash_session:review']);
    routeGets({
      '/api/v2/accounting/cash-sessions/review-queue': { sessions: [{ id: 's1', cashier: 'm9', submittedAt: null, submissionNo: 2, expected: {}, receiptCount: 3, discrepancy: false, ownSession: false }] },
      '/api/v2/accounting/cash-sessions/s1/detail': { ...detail, changedSinceSubmission: true },
    });
    renderAt('/finance/cash-review', '/finance/cash-review', <CashReviewPage />);
    await user.click(await screen.findByRole('button', { name: 'Review' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Receipts changed after this was submitted');
  });
});

describe('DepositsPage', () => {
  const overview = {
    approvedCash: { USD: '400.00' }, approvedSessions: 2, pendingCash: { USD: '75.00' }, pendingSessions: 1, depositsVerified: { USD: '250.00' },
    depositsAwaitingVerification: {}, undepositedCash: { USD: '150.00' }, sessionsOutstanding: [], funds: [{ id: 'f', name: 'General', balance: 380, isRestricted: false }], note: 'note',
  };
  test('shows approved and pending cash as separate tiles; only people with the right permission see actions', async () => {
    signIn(['finance:view']);
    routeGets({ '/api/v2/accounting/treasurer/overview': overview, '/api/v2/accounting/deposits': { deposits: [{ id: 'd1', currency: 'USD', amount: 250, depositDate: '2026-03-02', bankReference: 'SLIP-1', bankName: null, notes: null, status: 'PENDING', recordedBy: 'u', verifiedBy: null, rejectReason: null, cashSessionId: null }] } });
    renderAt('/finance/deposits', '/finance/deposits', <DepositsPage />);
    expect(await screen.findByText('Approved cash')).toBeInTheDocument();
    expect(screen.getByText(/Pending approval/)).toBeInTheDocument();
    expect(screen.getByText('General', { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Verify' })).not.toBeInTheDocument();
    expect(screen.queryByText('Record a deposit')).not.toBeInTheDocument();
  });

  test('a verifier sees Verify on a pending deposit and calls the endpoint', async () => {
    const user = userEvent.setup();
    signIn(['finance:view', 'finance:deposit:verify']);
    routeGets({ '/api/v2/accounting/treasurer/overview': overview, '/api/v2/accounting/deposits': { deposits: [{ id: 'd1', currency: 'USD', amount: 250, depositDate: '2026-03-02', bankReference: 'SLIP-1', bankName: null, notes: null, status: 'PENDING', recordedBy: 'u', verifiedBy: null, rejectReason: null, cashSessionId: null }] } });
    post.mockResolvedValue({ data: {} });
    renderAt('/finance/deposits', '/finance/deposits', <DepositsPage />);
    await user.click(await screen.findByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v2/accounting/deposits/d1/verify'));
  });
});

describe('ProfileCompletionPage', () => {
  test('shows the percentage from the server and names the missing details', async () => {
    signIn([]);
    routeGets({ '/api/v2/me/profile-completion/changes': { requests: [] }, '/api/v2/me/profile-completion': { required: ['phone', 'dateOfBirth', 'nextOfKin'], ruleSource: 'church', missing: ['dateOfBirth', 'nextOfKin'], percent: 33, nextOfKin: null } });
    renderAt('/my-account/completion', '/my-account/completion', <ProfileCompletionPage />);
    expect(await screen.findByText('33% complete')).toBeInTheDocument();
    expect(screen.getByText(/Still needed: Date of birth, Next of kin/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33');
  });
});
