import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { apiClient } from '@/utils/api';
import { renderAt, signIn } from '@/test/peopleTestUtils';
import { useAuthStore } from '@stores/authStore';
import { nextSacramentStep } from '@/types/pastoral';
import { CounselingPage } from './CounselingPage';
import { FollowUpsPage } from './FollowUpsPage';
import { PrayerPage } from './PrayerPage';
import { SacramentsPage } from './SacramentsPage';

vi.mock('@/utils/api', () => ({ apiClient: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock('@/components/Layout/MainLayout', () => ({ MainLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));

const get = vi.mocked(apiClient.get);
const member = { id: 'm1', firstName: 'Ann', lastName: 'Moyo' };

const routeGets = (map: Record<string, unknown>) =>
  get.mockImplementation((url: string) => {
    const key = Object.keys(map).sort((a, b) => b.length - a.length).find((k) => url.startsWith(k));
    return key ? Promise.resolve({ data: map[key] }) : Promise.reject(new Error(`unmocked ${url}`));
  });

beforeEach(() => {
  get.mockReset();
  useAuthStore.setState({ user: null });
});

describe('counseling confidentiality', () => {
  const session = { id: 'c1', memberId: 'm1', counselorId: 'p', counselingType: 'GRIEF', concern: 'Loss of a parent', intervention: null, outcome: 'ONGOING', sessionDate: '2026-03-01T00:00:00Z', hasConfidentialContent: true, member };

  test('list shows a badge, never the notes; form hides confidential fields without permission', async () => {
    signIn(['pastoral:counseling:view', 'pastoral:counseling:create']);
    routeGets({ '/api/v2/pastoral/counseling': { items: [session], total: 1 } });
    renderAt('/pastoral/counseling', '/pastoral/counseling', <CounselingPage />);
    await screen.findByText('Has confidential notes');
    await userEvent.click(screen.getByRole('button', { name: 'Record session' }));
    expect(screen.queryByLabelText('Confidential notes')).not.toBeInTheDocument();
  });

  test('form shows confidential fields only to the confidential role, with an audit notice', async () => {
    signIn(['pastoral:counseling:view', 'pastoral:counseling:create', 'pastoral:counseling:confidential']);
    routeGets({ '/api/v2/pastoral/counseling': { items: [], total: 0 } });
    renderAt('/pastoral/counseling', '/pastoral/counseling', <CounselingPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Record session' }));
    expect(screen.getByLabelText('Confidential notes')).toBeInTheDocument();
    expect(screen.getByText(/recorded in the audit log/)).toBeInTheDocument();
  });

  test('detail shows notes only when the server returned them', async () => {
    signIn(['pastoral:counseling:view']);
    routeGets({ '/api/v2/pastoral/counseling/c1': session, '/api/v2/pastoral/counseling': { items: [session], total: 1 } });
    renderAt('/pastoral/counseling', '/pastoral/counseling', <CounselingPage />);
    await userEvent.click(await screen.findByRole('button', { name: /Open session/ }));
    await screen.findByText(/do not have access/);
    expect(screen.queryByText('Confidential notes')).not.toBeInTheDocument();

  });

  test('detail shows the notes when the server released them', async () => {
    signIn(['pastoral:counseling:view', 'pastoral:counseling:confidential']);
    routeGets({ '/api/v2/pastoral/counseling/c1': { ...session, confidentialNotes: 'private details', followUpPlan: null }, '/api/v2/pastoral/counseling': { items: [session], total: 1 } });
    renderAt('/pastoral/counseling', '/pastoral/counseling', <CounselingPage />);
    await userEvent.click(await screen.findByRole('button', { name: /Open session/ }));
    expect(await screen.findByText('private details')).toBeInTheDocument();
  });
});

describe('sacraments', () => {
  test('nextSacramentStep returns only the single next step', () => {
    expect(nextSacramentStep('baptism', 'CANDIDATE')).toBe('IN_PREPARATION');
    expect(nextSacramentStep('baptism', 'RECORDED')).toBeNull();
    expect(nextSacramentStep('marriage', 'APPROVED')).toBe('MARRIED');
  });

  test('a record offers exactly one advance button and asks for required fields', async () => {
    signIn(['pastoral:sacrament:manage']);
    routeGets({ '/api/v2/pastoral/sacraments/baptisms': { items: [{ id: 'b1', memberId: 'm1', status: 'APPROVED', member }], total: 1 } });
    renderAt('/pastoral/sacraments', '/pastoral/sacraments', <SacramentsPage />);
    const buttons = await screen.findAllByRole('button', { name: /^Advance to/ });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent('Advance to Baptized');
    await userEvent.click(buttons[0]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Baptism date')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Baptized by')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Advance' })).toBeDisabled();
  });

  test('a recorded sacrament is final', async () => {
    signIn(['pastoral:sacrament:manage']);
    routeGets({ '/api/v2/pastoral/sacraments/baptisms': { items: [{ id: 'b1', memberId: 'm1', status: 'RECORDED', member }], total: 1 } });
    renderAt('/pastoral/sacraments', '/pastoral/sacraments', <SacramentsPage />);
    await screen.findByText('Final');
    expect(screen.queryByRole('button', { name: /^Advance to/ })).not.toBeInTheDocument();
  });
});

describe('prayer tabs', () => {
  test('the Manage tab is hidden without prayer:view', async () => {
    signIn([]);
    routeGets({ '/api/v2/pastoral/prayer/mine': { items: [], total: 0 } });
    renderAt('/pastoral/prayer', '/pastoral/prayer', <PrayerPage />);
    await screen.findByText('Ask for prayer');
    expect(screen.getByRole('tab', { name: 'Prayer wall' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Manage' })).not.toBeInTheDocument();
  });

  test('the Manage tab appears with prayer:view', async () => {
    signIn(['pastoral:prayer:view']);
    routeGets({ '/api/v2/pastoral/prayer/mine': { items: [], total: 0 } });
    renderAt('/pastoral/prayer', '/pastoral/prayer', <PrayerPage />);
    expect(await screen.findByRole('tab', { name: 'Manage' })).toBeInTheDocument();
  });
});

describe('follow-ups', () => {
  test('uses effectiveStatus so an overdue pending follow-up shows the Overdue badge', async () => {
    signIn(['pastoral:followup:view']);
    routeGets({
      '/api/v2/pastoral/followups': {
        items: [{ id: 'f1', memberId: 'm1', caseId: 'c', dueDate: '2020-01-01T00:00:00Z', completedAt: null, reason: 'Check in', notes: null, status: 'PENDING', effectiveStatus: 'OVERDUE', member }],
        total: 1,
      },
    });
    renderAt('/pastoral/followups', '/pastoral/followups', <FollowUpsPage />);
    expect(await screen.findByText('Overdue', { selector: 'span' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Complete' })).not.toBeInTheDocument()); // no manage permission
  });
});
