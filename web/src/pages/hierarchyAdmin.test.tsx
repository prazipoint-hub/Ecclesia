import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { apiClient } from '@/utils/api';
import { renderAt, signIn } from '@/test/peopleTestUtils';
import { useAuthStore } from '@stores/authStore';
import { MemberImportJobsPage } from './members/MemberImportJobsPage';
import { CircuitOnboardingPage } from './district/CircuitOnboardingPage';
import { AccessAssignmentsPage } from './admin/AccessAssignmentsPage';
import { ContextsPage } from './account/ContextsPage';

vi.mock('@/utils/api', () => ({ apiClient: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock('@/components/Layout/MainLayout', () => ({ MainLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
const get = vi.mocked(apiClient.get);
const post = vi.mocked(apiClient.post);
const put = vi.mocked(apiClient.put);
const route = (map: Record<string, unknown>) => get.mockImplementation((url: string) => {
  const k = Object.keys(map).sort((a, b) => b.length - a.length).find((x) => url.startsWith(x));
  return k ? Promise.resolve({ data: map[k] }) : Promise.reject(new Error(`unmocked ${url}`));
});
beforeEach(() => { get.mockReset(); post.mockReset(); put.mockReset(); useAuthStore.setState({ user: null }); });

const summary = (over: Record<string, unknown> = {}) => ({ id: 'j1', fileName: 'm.csv', status: 'PREVIEWED', reconciles: true, remaining: 1, counts: { totalRows: 3, imported: 0, skipped: 0, rejected: 1, failed: 0, awaitingDecision: 1, readyToImport: 1 }, ...over });

describe('checked member import', () => {
  test('uploads, shows a row needing a decision, records it, and blocks confirm until it is decided or skipped', async () => {
    signIn(['member:import']);
    post.mockResolvedValue({ data: summary() });
    put.mockResolvedValue({ data: { updated: 1 } });
    route({
      '/api/v2/members/import-jobs/j1/rows': { total: 1, rows: [{ rowNumber: 3, status: 'REVIEW', reason: 'POSSIBLE_MATCH', decision: null, original: { firstName: 'Ann', lastName: 'Moyo' }, errors: [], warnings: [], matches: [{ memberId: 'm9', name: 'Ann Moyo', membershipNumber: 'M-9' }] }] },
      '/api/v2/members/import-jobs/j1': summary(),
    });
    renderAt('/members/import-jobs', '/members/import-jobs', <MemberImportJobsPage />);
    const file = new File(['firstName,lastName\nAnn,Moyo'], 'm.csv', { type: 'text/csv' });
    await userEvent.upload(screen.getByLabelText('CSV file'), file);
    expect(await screen.findByText(/Row 3/)).toBeInTheDocument();
    expect(post.mock.calls[0][0]).toBe('/api/v2/members/import-jobs');
    expect(screen.getByRole('button', { name: /Import 1 row/ })).toBeDisabled(); // one row still undecided
    await userEvent.click(screen.getByRole('button', { name: 'Create as new' }));
    expect(put).toHaveBeenCalledWith('/api/v2/members/import-jobs/j1/decisions', { decisions: [{ row: 3, decision: 'CREATE' }] });
    await userEvent.click(screen.getByLabelText(/Skip the 1 row/));
    expect(screen.getByRole('button', { name: /Import 1 row/ })).toBeEnabled();
  });

  test('warns when counts do not reconcile', async () => {
    signIn(['member:import']);
    post.mockResolvedValue({ data: summary({ reconciles: false }) });
    route({ '/api/v2/members/import-jobs/j1/rows': { total: 0, rows: [] }, '/api/v2/members/import-jobs/j1': summary({ reconciles: false }) });
    renderAt('/members/import-jobs', '/members/import-jobs', <MemberImportJobsPage />);
    await userEvent.upload(screen.getByLabelText('CSV file'), new File(['a'], 'm.csv', { type: 'text/csv' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/do not add up/);
  });

  test('refuses without the permission', () => {
    signIn([]);
    renderAt('/members/import-jobs', '/members/import-jobs', <MemberImportJobsPage />);
    expect(screen.queryByLabelText('CSV file')).toBeNull();
  });
});

describe('circuit onboarding page', () => {
  test('lists blockers and only lets a ready step be confirmed', async () => {
    signIn(['circuit:view', 'circuit:onboard']);
    route({
      '/api/v2/hierarchy/units': { conferences: [], districts: [] },
      '/api/v2/hierarchy/circuits/c1/onboarding': { circuitId: 'c1', completedAt: null, progress: { done: 0, total: 2 }, canComplete: false, steps: [
        { step: 'DETAILS', title: 'Confirm circuit details', kind: 'confirm', confirmed: false, ready: false, done: false, blockers: ['no location recorded'] },
        { step: 'MEMBERSHIP', title: 'Import and verify membership', kind: 'confirm', confirmed: false, ready: true, done: false, blockers: [] },
      ] },
      '/api/v2/hierarchy/circuits': { circuits: [{ id: 'c1', name: 'North', location: null, status: 'ACTIVE', district: null, conference: null }] },
    });
    renderAt('/circuits', '/circuits', <CircuitOnboardingPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Onboarding' }));
    expect(await screen.findByText(/no location recorded/)).toBeInTheDocument();
    const confirms = screen.getAllByRole('button', { name: 'Confirm' });
    expect(confirms[0]).toBeDisabled();
    expect(confirms[1]).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Complete onboarding' })).toBeDisabled();
    expect(screen.queryByText('Register a circuit')).toBeNull(); // no registrable district for this user
  });
});

describe('access by unit', () => {
  test('searches accounts inside the unit and assigns the chosen role', async () => {
    signIn(['access:assign']);
    post.mockResolvedValue({ data: { created: true } });
    route({
      '/api/v2/hierarchy/circuits': { circuits: [] },
      '/api/v2/access/assignments': { assignments: [] },
      '/api/v2/access/assignable-roles': { roles: [{ id: 'r1', name: 'Viewer', church: 'Alpha', permissionCount: 2 }] },
      '/api/v2/access/users': { users: [{ id: 'u2', email: 'x@y.org', name: 'X Y' }] },
    });
    renderAt('/admin/access', '/admin/access', <AccessAssignmentsPage />);
    await userEvent.type(await screen.findByLabelText(/Find the person/), 'x@y');
    await userEvent.selectOptions(await screen.findByLabelText('Person'), 'u2');
    await userEvent.selectOptions(screen.getByLabelText('Role'), 'r1');
    await userEvent.click(screen.getByRole('button', { name: 'Give access' }));
    expect(post.mock.calls[0][0]).toBe('/api/v2/access/assignments');
    expect(post.mock.calls[0][1]).toMatchObject({ userId: 'u2', roleId: 'r1', scopeType: 'CHURCH' });
  });
});

describe('where I hold a role', () => {
  test('shows a removed role as gone when the server refuses', async () => {
    signIn([]);
    route({ '/api/v2/access/me/contexts': { contexts: [{ id: 'a1', role: { id: 'r1', name: 'Treasurer' }, scope: { type: 'CIRCUIT', id: 'c1' }, endsAt: null }] } });
    post.mockRejectedValue(new Error('Forbidden: you no longer hold a role in this context'));
    renderAt('/my-account/contexts', '/my-account/contexts', <ContextsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Check' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/no longer hold/);
  });
});
