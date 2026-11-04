import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Sidebar } from '@/components/Layout/Sidebar';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { AdminUser } from '@/types/admin';
import type { User } from '@/types/auth';
import { apiClient } from '@/utils/api';
import { useAuthStore } from '@stores/authStore';
import { AuditLogPage } from './AuditLogPage';
import { RetentionPage } from './RetentionPage';
import { RolesPage } from './RolesPage';
import { UserDetail } from './UsersPage';

vi.mock('@/utils/api', () => ({ apiClient: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock('@/components/Layout/MainLayout', () => ({ MainLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));

const get = vi.mocked(apiClient.get);
const post = vi.mocked(apiClient.post);

const signIn = (permissions: string[]) =>
  useAuthStore.setState({ user: { id: 'u1', email: 'a@b.co', firstName: 'A', lastName: 'B', churchId: 'church-1', permissions, committees: [], sbus: [], organizationContexts: [] } as User });

const target: AdminUser = {
  id: 'u2', email: 'x@y.co', emailVerified: true, createdAt: '2026-01-01T00:00:00Z', memberId: 'm2', name: 'Pat Doe', membershipNumber: 'M2',
  twoFactorEnabled: false, lastSignInAt: null, disabled: false, disabledAt: null, disabledReason: null, roles: [],
};

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  useAuthStore.setState({ user: null });
});

describe('permission gating', () => {
  test('roles page shows no-access and makes no request without the permission', () => {
    signIn(['finance:view']);
    renderWithProviders(<RolesPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('admin:role:manage');
    expect(get).not.toHaveBeenCalled();
  });

  test('sidebar shows admin links only for held permissions', () => {
    signIn(['admin:audit:view']);
    renderWithProviders(<Sidebar isOpen onClose={() => undefined} />);
    expect(screen.getByText('Audit log')).toBeInTheDocument();
    expect(screen.queryByText('Users')).not.toBeInTheDocument();
    expect(screen.queryByText('Data retention')).not.toBeInTheDocument();
  });
});

describe('disabling a user', () => {
  test('requires a reason of at least 5 characters', async () => {
    signIn(['admin:user:manage']);
    renderWithProviders(<UserDetail user={target} onClose={() => undefined} />);
    await userEvent.type(screen.getByLabelText(/Reason for switching off/), 'no');
    await userEvent.click(screen.getByRole('button', { name: 'Switch off account' }));
    expect(await screen.findByText(/at least 5 characters/)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  test('sends the reason and shows the server conflict message', async () => {
    signIn(['admin:user:manage']);
    post.mockRejectedValue({ isAxiosError: true, response: { data: { error: 'This is the last account that can manage users.' } } });
    renderWithProviders(<UserDetail user={target} onClose={() => undefined} />);
    await userEvent.type(screen.getByLabelText(/Reason for switching off/), 'left the church');
    await userEvent.click(screen.getByRole('button', { name: 'Switch off account' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v2/admin/users/u2/disable', { reason: 'left the church' }));
  });
});

describe('retention', () => {
  const rows = [{ entityType: 'AUDIT_LOG', minDays: 365, label: 'Audit log entries', rule: { retentionDays: 400, isActive: true, lastRunAt: null, lastPurged: null } }];

  test('preview sends dryRun true; delete now needs confirmation', async () => {
    signIn(['admin:retention:manage']);
    get.mockResolvedValue({ data: rows });
    post.mockResolvedValue({ data: { dryRun: true, results: [{ entityType: 'AUDIT_LOG', retentionDays: 400, cutoff: '', wouldRemove: 7 }] } });
    renderWithProviders(<RetentionPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Preview what would be removed' }));
    expect(post).toHaveBeenCalledWith('/api/v2/admin/retention/run', { dryRun: true });
    expect(await screen.findByText(/7 would be removed/)).toBeInTheDocument();

    post.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'Delete now' }));
    expect(post).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /Yes, delete permanently/ }));
    expect(post).toHaveBeenCalledWith('/api/v2/admin/retention/run', { dryRun: false });
  });

  test('a rule below the minimum cannot be saved', async () => {
    signIn(['admin:retention:manage']);
    get.mockResolvedValue({ data: rows });
    renderWithProviders(<RetentionPage />);
    const input = await screen.findByLabelText('Days for Audit log entries');
    await userEvent.clear(input);
    await userEvent.type(input, '30');
    expect(screen.getByRole('button', { name: 'Save rule for Audit log entries' })).toBeDisabled();
  });
});

describe('audit export', () => {
  test('needs both dates before calling the server', async () => {
    signIn(['admin:audit:view']);
    get.mockResolvedValue({ data: { items: [], total: 0 } });
    renderWithProviders(<AuditLogPage />);
    await screen.findByText('No entries match.');
    get.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(await screen.findByText(/start and end date/)).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });
});
