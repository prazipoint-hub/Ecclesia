import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { apiClient } from '@/utils/api';
import { apiError, renderAt, signIn } from '@/test/peopleTestUtils';
import { useAuthStore } from '@stores/authStore';
import { AbsencesPage } from './AbsencesPage';
import { MyBadgePage } from './MyBadgePage';
import { ScanPage } from './ScanPage';
import { UpcomingEventsPage } from './UpcomingEventsPage';
import { VolunteersPage } from './VolunteersPage';

vi.mock('@/utils/api', () => ({ apiClient: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock('@/components/Layout/MainLayout', () => ({ MainLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));

const get = vi.mocked(apiClient.get);
const post = vi.mocked(apiClient.post);

const routeGets = (map: Record<string, unknown>) =>
  get.mockImplementation((url: string) => {
    const key = Object.keys(map).sort((a, b) => b.length - a.length).find((k) => url.startsWith(k));
    return key ? Promise.resolve({ data: map[key] }) : Promise.reject(new Error(`unmocked ${url}`));
  });

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  useAuthStore.setState({ user: null });
});
afterEach(() => { vi.useRealTimers(); });

const upcoming = (over: Record<string, unknown>) => ({
  id: 'e1', title: 'Retreat', description: null, eventType: 'RETREAT', startDateTime: '2030-01-01T09:00:00Z', endDateTime: null, location: null,
  capacity: 10, registrationRequired: true, registered: 10, spotsLeft: 0, registeredByMe: false, ...over,
});

describe('upcoming events', () => {
  test('register is disabled when the event is full, and cancel is offered when already registered', async () => {
    signIn([]);
    routeGets({ '/api/v2/events/upcoming': [upcoming({}), upcoming({ id: 'e2', title: 'Picnic', spotsLeft: 3, registered: 7 }), upcoming({ id: 'e3', title: 'Camp', registeredByMe: true })] });
    renderAt('/events/upcoming', '/events/upcoming', <UpcomingEventsPage />);
    await screen.findByText('Retreat');
    expect(screen.getByRole('button', { name: 'Full' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Register' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancel registration' })).toBeEnabled();
  });
});

describe('member badge', () => {
  test('requests a fresh badge before the current one expires', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    signIn([]);
    let n = 0;
    get.mockImplementation(() => Promise.resolve({ data: { token: `t${++n}`, dataUrl: 'data:image/png;base64,AAA', expiresAt: new Date(Date.now() + 120_000).toISOString() } }));
    renderAt('/events/my-badge', '/events/my-badge', <MyBadgePage />);
    await screen.findByAltText('Your check-in QR code');
    expect(get).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });
    expect(get).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });
});

describe('self check-in', () => {
  test('works without BarcodeDetector: no camera button, paste a code, success and server error', async () => {
    signIn([]);
    expect((globalThis as { BarcodeDetector?: unknown }).BarcodeDetector).toBeUndefined();
    renderAt('/events/scan', '/events/scan', <ScanPage />);
    expect(screen.queryByRole('button', { name: 'Scan with camera' })).not.toBeInTheDocument();

    post.mockResolvedValueOnce({ data: { alreadyCheckedIn: false, checkedInAt: '2026-03-01T09:00:00Z', method: 'QR', member: { id: 'm1', firstName: 'Ann', lastName: 'Moyo' }, event: { id: 'e1', title: 'Sunday Service', endsAt: '2026-03-01T11:00:00Z' } } });
    await userEvent.type(screen.getByLabelText('Door code'), 'abc.def.ghi');
    await userEvent.click(screen.getByRole('button', { name: 'Check in' }));
    expect(await screen.findByText('You are checked in')).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith('/api/v2/events/checkin/self', { token: 'abc.def.ghi' });

    post.mockRejectedValueOnce(apiError('This QR code is invalid or has expired'));
    await userEvent.click(screen.getByRole('button', { name: 'Check in' }));
    expect(await screen.findByText('This QR code is invalid or has expired')).toBeInTheDocument();
  });

  test('shows the already-checked-in variant', async () => {
    signIn([]);
    post.mockResolvedValue({ data: { alreadyCheckedIn: true, checkedInAt: '2026-03-01T09:00:00Z', method: 'QR', member: { id: 'm1', firstName: 'Ann', lastName: 'Moyo' }, event: { id: 'e1', title: 'Sunday Service', endsAt: '' } } });
    renderAt('/events/scan', '/events/scan', <ScanPage />);
    await userEvent.type(screen.getByLabelText('Door code'), 'abc.def.ghi');
    await userEvent.click(screen.getByRole('button', { name: 'Check in' }));
    expect(await screen.findByText('You were already checked in')).toBeInTheDocument();
  });
});

describe('absence follow-ups', () => {
  const absence = (status: string) => ({ id: 'a1', memberId: 'm1', consecutiveAbsences: 3, eventType: 'SERVICE', status, assignedTo: null, notes: null, detectedAt: '2026-03-01T00:00:00Z', member: { id: 'm1', firstName: 'Ann', lastName: 'Moyo' } });

  test('closing needs notes; contacting does not', async () => {
    signIn(['absence:followup:manage']);
    routeGets({ '/api/v2/events/absences': { items: [absence('OPEN')], total: 1 } });
    vi.mocked(apiClient.put).mockResolvedValue({ data: {} });
    renderAt('/events/absences', '/events/absences', <AbsencesPage />);
    await screen.findByText('Ann Moyo');
    await userEvent.click(screen.getByRole('button', { name: 'Resolved' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Say what happened before closing this follow-up.')).toBeInTheDocument();
    expect(apiClient.put).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Notes'), 'Back at church');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(apiClient.put).toHaveBeenCalledWith('/api/v2/events/absences/a1', { status: 'RESOLVED', notes: 'Back at church' }));
  });

  test('a closed follow-up offers no actions', async () => {
    signIn(['absence:followup:manage']);
    routeGets({ '/api/v2/events/absences': { items: [absence('RESOLVED')], total: 1 } });
    renderAt('/events/absences', '/events/absences', <AbsencesPage />);
    await screen.findByText('Ann Moyo');
    expect(screen.queryByRole('button', { name: 'Assign' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Contacted' })).not.toBeInTheDocument();
  });
});

describe('volunteers', () => {
  const row = (id: string, status: string) => ({ id, eventId: 'e1', memberId: 'm1', role: `Role-${id}`, status, notes: null, member: { id: 'm1', firstName: 'Ann', lastName: 'Moyo' }, event: { id: 'e1', title: 'Service', startDateTime: '2030-01-01T09:00:00Z' } });

  test('final states show no action buttons; open ones do', async () => {
    signIn(['volunteer:schedule:view', 'volunteer:schedule:manage']);
    routeGets({
      '/api/v2/events/volunteers/mine': { items: [], total: 0 },
      '/api/v2/events/volunteers': { items: [row('a', 'COMPLETED'), row('b', 'NO_SHOW'), row('c', 'CANCELLED'), row('d', 'ASSIGNED')], total: 4 },
      '/api/v2/events': { events: [] },
    });
    renderAt('/events/volunteers', '/events/volunteers', <VolunteersPage />);
    await screen.findByText('Role-d');
    // only the open assignment has the three status buttons
    expect(screen.getAllByRole('button', { name: 'Completed' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'No-show' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Cancel' })).toHaveLength(1);
  });

  test('my volunteering offers confirm and decline for a new assignment', async () => {
    signIn([]);
    routeGets({ '/api/v2/events/volunteers/mine': { items: [row('a', 'ASSIGNED')], total: 1 } });
    renderAt('/events/volunteers', '/events/volunteers', <VolunteersPage />);
    expect(await screen.findByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument();
  });
});
