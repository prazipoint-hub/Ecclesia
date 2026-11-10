import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { apiClient } from '@/utils/api';
import { renderAt, signIn } from '@/test/peopleTestUtils';
import { useAuthStore } from '@stores/authStore';
import { ExpendituresPage } from './ExpendituresPage';

vi.mock('@/utils/api', () => ({ apiClient: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock('@/components/Layout/MainLayout', () => ({ MainLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
const get = vi.mocked(apiClient.get);
const post = vi.mocked(apiClient.post);
beforeEach(() => { get.mockReset(); post.mockReset(); useAuthStore.setState({ user: null }); });

describe('expenditures page', () => {
  test('tells the approver when a second approval is still needed', async () => {
    signIn(['finance:view', 'finance:expenditure:approve']);
    useAuthStore.setState({ user: { ...useAuthStore.getState().user!, churchId: 'church-1' } });
    get.mockImplementation((url: string) => Promise.resolve({ data: url.includes('/expenditures') ? { expenditures: [{ id: 'e1', fundId: 'f1', amount: 900, purpose: 'Roof', category: 'Building', status: 'SUBMITTED', requestedAt: '2026-03-01T00:00:00Z', paidAt: null, approvalsRecorded: 0 }] } : { dualApprovalThreshold: 500 } }));
    post.mockResolvedValue({ data: { awaitingSecondApproval: true, approvalsRecorded: 1, approvalsNeeded: 2 } });
    renderAt('/finance/expenditures', '/finance/expenditures', <ExpendituresPage />);
    expect(await screen.findByText(/need two different approvers/)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(post.mock.calls[0][0]).toBe('/api/v2/churches/church-1/expenditures/e1/approve');
    expect(await screen.findByRole('status')).toHaveTextContent('1 of 2');
  });
});
