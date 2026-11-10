import { screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { apiClient } from '@/utils/api';
import { renderAt, signIn } from '@/test/peopleTestUtils';
import { useAuthStore } from '@stores/authStore';
import { FinanceReportsPage } from './ReportsPage';

vi.mock('@/utils/api', () => ({ apiClient: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock('@/components/Layout/MainLayout', () => ({ MainLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
const get = vi.mocked(apiClient.get);
beforeEach(() => { get.mockReset(); useAuthStore.setState({ user: null }); });

describe('report drill-down', () => {
  test('trial balance accounts link to their ledger for the same date', async () => {
    signIn(['finance:view']);
    get.mockResolvedValue({ data: { rows: [{ accountId: 'a1', code: '1100', name: 'Bank', type: 'ASSET', debit: 50, credit: 0 }], totalDebit: 50, totalCredit: 50, balanced: true } });
    renderAt('/finance/reports', '/finance/reports', <FinanceReportsPage />);
    const link = await screen.findByRole('link', { name: '1100 Bank' });
    expect(link.getAttribute('href')).toMatch(/^\/finance\/accounts\?account=a1&to=\d{4}-\d{2}-\d{2}$/);
  });
});
