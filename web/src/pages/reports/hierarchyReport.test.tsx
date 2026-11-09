import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { apiClient } from '@/utils/api';
import { renderAt, signIn } from '@/test/peopleTestUtils';
import { useAuthStore } from '@stores/authStore';
import { HierarchyReportPage } from './HierarchyReportPage';

vi.mock('@/utils/api', () => ({ apiClient: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock('@/components/Layout/MainLayout', () => ({ MainLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
const get = vi.mocked(apiClient.get);

beforeEach(() => { get.mockReset(); useAuthStore.setState({ user: null }); });

const circuits = { circuits: [{ id: 'c1', name: 'North', district: { id: 'd1', name: 'East' }, conference: { id: 'k1', name: 'Main' } }] };

describe('consolidated reports page', () => {
  test('offers conference, district and circuit, and sends the chosen unit to the server', async () => {
    signIn([]);
    get.mockImplementation((url: string) => Promise.resolve({ data: url.includes('/hierarchy/circuits') ? circuits : { kind: 'MEMBERSHIP', scopeName: 'East', churchCount: 1, truncated: false, generatedAt: new Date().toISOString(), rows: [{ church: 'Alpha', activeMembers: 4 }, { church: 'TOTAL', activeMembers: 4 }] } }));
    renderAt('/reports/consolidated', '/reports/consolidated', <HierarchyReportPage />);
    const unit = await screen.findByLabelText('Unit');
    expect(screen.getByRole('option', { name: 'East (district)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Main (conference)' })).toBeInTheDocument();
    await userEvent.selectOptions(unit, 'DISTRICT:d1');
    await userEvent.click(screen.getByRole('button', { name: 'Run report' }));
    await screen.findByText('Alpha');
    const call = get.mock.calls.find((c) => String(c[0]).endsWith('/hierarchy'))!;
    expect(call[1]).toEqual({ params: { kind: 'MEMBERSHIP', scopeType: 'DISTRICT', scopeId: 'd1' } });
  });

  test('shows the server refusal instead of data', async () => {
    signIn([]);
    get.mockImplementation((url: string) => (url.includes('/hierarchy/circuits') ? Promise.resolve({ data: circuits }) : Promise.reject(new Error('Forbidden'))));
    renderAt('/reports/consolidated', '/reports/consolidated', <HierarchyReportPage />);
    await screen.findByLabelText('Unit');
    await userEvent.click(screen.getByRole('button', { name: 'Run report' }));
    expect(await screen.findByText(/forbidden/i)).toBeInTheDocument();
  });
});
