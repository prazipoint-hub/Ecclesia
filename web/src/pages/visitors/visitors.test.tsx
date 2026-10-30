import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { apiError, renderAt, signIn } from '@/test/peopleTestUtils';
import type { Visitor, VisitorPage } from '@/types/people';
import { apiClient } from '@/utils/api';
import { useAuthStore } from '@stores/authStore';
import { VisitorDetailPage } from './VisitorDetailPage';
import { VisitorsPage } from './VisitorsPage';

vi.mock('@/utils/api', () => ({ apiClient: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock('@/components/Layout/MainLayout', () => ({ MainLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));

const get = vi.mocked(apiClient.get);
const post = vi.mocked(apiClient.post);

const visitor = (over: Partial<Visitor> = {}): Visitor => ({
  id: 'v1', firstName: 'Tendai', lastName: 'Dube', phone: '0771234567', email: 'tendai@example.com', visitDate: '2026-04-01T00:00:00Z', source: 'Friend',
  notes: null, followUpStatus: 'NEW', assignedToId: null, convertedMemberId: null, createdAt: '2026-04-01T00:00:00Z',
  followUps: [{ id: 'f1', method: 'CALL', notes: 'Left a message', createdAt: '2026-04-02T00:00:00Z' }], ...over,
});
const page: VisitorPage = { items: [visitor()], total: 1, page: 1, pageSize: 25, statusCounts: { NEW: 1, CONTACTED: 2 } };

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  useAuthStore.setState({ user: null });
  get.mockImplementation(async (url: string) => {
    if (url === '/api/v2/visitors') return { data: page };
    if (url === '/api/v2/visitors/v1') return { data: visitor() };
    if (url === '/api/v2/sections') return { data: { sections: [{ id: 's1', name: 'East' }] } };
    throw new Error(`unexpected GET ${url}`);
  });
});

describe('VisitorsPage', () => {
  test('without visitor:view nothing is requested', () => {
    signIn([]);
    renderWithProviders(<VisitorsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('visitor:view');
    expect(get).not.toHaveBeenCalled();
  });

  test('lists visitors with status counts and filters by status', async () => {
    signIn(['visitor:view']);
    renderWithProviders(<VisitorsPage />);
    expect(await screen.findByRole('link', { name: 'Tendai Dube' })).toHaveAttribute('href', '/visitors/v1');
    expect(screen.getByRole('button', { name: /Contacted \(2\)/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Contacted/ }));
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/api/v2/visitors', { params: { status: 'CONTACTED', page: 1, pageSize: 25 } }));
  });

  test('adding a visitor needs the create permission and validates', async () => {
    signIn(['visitor:view']);
    const { unmount } = renderWithProviders(<VisitorsPage />);
    await screen.findByRole('link', { name: 'Tendai Dube' });
    expect(screen.queryByRole('button', { name: 'New visitor' })).not.toBeInTheDocument();
    unmount();

    signIn(['visitor:view', 'visitor:create']);
    post.mockResolvedValue({ data: visitor() });
    renderWithProviders(<VisitorsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'New visitor' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add visitor' }));
    expect(await within(dialog).findByText('Enter a first name.')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByLabelText('First name'), 'Rudo');
    await userEvent.type(within(dialog).getByLabelText('Last name'), 'Banda');
    await userEvent.type(within(dialog).getByLabelText('Email'), 'nope');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add visitor' }));
    expect(await within(dialog).findByText('Enter a valid email address.')).toBeInTheDocument();
    await userEvent.clear(within(dialog).getByLabelText('Email'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add visitor' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v2/visitors', expect.objectContaining({ firstName: 'Rudo', lastName: 'Banda' })));
  });
});

describe('VisitorDetailPage', () => {
  test('shows the history and logs a follow-up with an outcome', async () => {
    signIn(['visitor:view', 'visitor:manage']);
    post.mockResolvedValue({ data: visitor() });
    renderAt('/visitors/:id', '/visitors/v1', <VisitorDetailPage />);
    expect(await screen.findByText('Left a message')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('How'), 'VISIT');
    await userEvent.selectOptions(screen.getByLabelText('Outcome (optional)'), 'SCHEDULED');
    await userEvent.type(screen.getByLabelText('Notes'), 'Home visit booked');
    await userEvent.click(screen.getByRole('button', { name: 'Save follow-up' }));
    expect(post).toHaveBeenCalledWith('/api/v2/visitors/v1/follow-ups', { method: 'VISIT', notes: 'Home visit booked', status: 'SCHEDULED' });
  });

  test('converting creates a member and shows the membership number', async () => {
    signIn(['visitor:view', 'visitor:manage', 'member:create']);
    post.mockResolvedValue({ data: { visitor: visitor({ followUpStatus: 'JOINED', convertedMemberId: 'm9' }), member: { id: 'm9', membershipNumber: 'M20260042' } } });
    renderAt('/visitors/:id', '/visitors/v1', <VisitorDetailPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Convert to member' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.selectOptions(await within(dialog).findByLabelText('Section (optional)'), 's1');
    await userEvent.selectOptions(within(dialog).getByLabelText('Gender (optional)'), 'FEMALE');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create member' }));
    expect(post).toHaveBeenCalledWith('/api/v2/visitors/v1/convert', { sectionId: 's1', gender: 'FEMALE' });
    expect(await screen.findByText(/Membership number M20260042/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('a conflict from the server is shown in the dialog and the dialog stays open', async () => {
    signIn(['visitor:view', 'visitor:manage', 'member:create']);
    post.mockRejectedValue(apiError('A member with this email already exists.', 409));
    renderAt('/visitors/:id', '/visitors/v1', <VisitorDetailPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Convert to member' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create member' }));
    expect(await within(screen.getByRole('dialog')).findByText('A member with this email already exists.')).toBeInTheDocument();
  });

  test('conversion needs member:create as well as visitor:manage', async () => {
    signIn(['visitor:view', 'visitor:manage']);
    renderAt('/visitors/:id', '/visitors/v1', <VisitorDetailPage />);
    await screen.findByRole('heading', { name: 'Tendai Dube' });
    expect(screen.queryByRole('button', { name: 'Convert to member' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save follow-up' })).toBeInTheDocument();
  });

  test('a converted visitor is read-only and links to the member', async () => {
    signIn(['visitor:view', 'visitor:manage', 'member:create']);
    get.mockImplementation(async () => ({ data: visitor({ followUpStatus: 'JOINED', convertedMemberId: 'm9' }) }));
    renderAt('/visitors/:id', '/visitors/v1', <VisitorDetailPage />);
    expect(await screen.findByRole('link', { name: 'View member record' })).toHaveAttribute('href', '/members/m9');
    expect(screen.queryByRole('button', { name: 'Convert to member' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save follow-up' })).not.toBeInTheDocument();
  });
});
