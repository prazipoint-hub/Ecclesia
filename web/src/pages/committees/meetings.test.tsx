import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { apiError, renderAt, signIn } from '@/test/peopleTestUtils';
import type { MeetingDetail } from '@/types/people';
import { apiClient } from '@/utils/api';
import { useAuthStore } from '@stores/authStore';
import { CommitteeMeetingsPage } from './CommitteeMeetingsPage';
import { MeetingDetailPage } from './MeetingDetailPage';

vi.mock('@/utils/api', () => ({ apiClient: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock('@/components/Layout/MainLayout', () => ({ MainLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));

const get = vi.mocked(apiClient.get);
const put = vi.mocked(apiClient.put);
const post = vi.mocked(apiClient.post);
const del = vi.mocked(apiClient.delete);

const meeting = (over: Partial<MeetingDetail> = {}): MeetingDetail => ({
  id: 'mt1', committeeId: 'c1', committeeName: 'Finance Committee', title: 'Budget review', scheduledAt: '2026-05-10T09:00:00Z', location: 'Hall', agenda: 'Budget',
  minutes: null, status: 'SCHEDULED', minutesLocked: false, minutesLockedAt: null,
  decisions: [{ id: 'd1', description: 'Approve budget', status: 'APPROVED', votesFor: 5, votesAgainst: 1, abstentions: 0, ownerMemberId: null, dueDate: null }], ...over,
});
const MANAGE = ['committee:view', 'committee:meeting:manage'];
const detailRoute = '/committees/:committeeId/meetings/:meetingId';
const open = (m: MeetingDetail) => {
  get.mockImplementation(async () => ({ data: m }));
  return renderAt(detailRoute, '/committees/c1/meetings/mt1', <MeetingDetailPage />);
};

beforeEach(() => {
  get.mockReset();
  put.mockReset();
  post.mockReset();
  del.mockReset();
  useAuthStore.setState({ user: null });
});

describe('CommitteeMeetingsPage', () => {
  const listRoute = '/committees/:committeeId/meetings';
  beforeEach(() => {
    get.mockImplementation(async (url: string) => {
      if (url === '/api/v2/committees') return { data: [{ id: 'c1', name: 'Finance Committee' }] };
      return { data: { items: [{ id: 'mt1', title: 'Budget review', scheduledAt: '2026-05-10T09:00:00Z', location: 'Hall', status: 'HELD', minutesLocked: true, decisionCount: 2 }], total: 1, page: 1, pageSize: 20 } };
    });
  });

  test('lists meetings under the committee name with a lock marker', async () => {
    signIn(['committee:view']);
    renderAt(listRoute, '/committees/c1/meetings', <CommitteeMeetingsPage />);
    expect(await screen.findByRole('link', { name: 'Budget review' })).toHaveAttribute('href', '/committees/c1/meetings/mt1');
    expect(await screen.findByRole('heading', { name: 'Finance Committee meetings' })).toBeInTheDocument();
    expect(screen.getByLabelText('Minutes locked')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New meeting' })).not.toBeInTheDocument();
  });

  test('scheduling validates, then posts an ISO time', async () => {
    signIn(['committee:view', 'committee:meeting:create']);
    post.mockResolvedValue({ data: { id: 'mt2' } });
    renderAt(listRoute, '/committees/c1/meetings', <CommitteeMeetingsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'New meeting' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create meeting' }));
    expect(await within(dialog).findByText('Enter a title.')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
    await userEvent.type(within(dialog).getByLabelText('Title'), 'Audit');
    await userEvent.type(within(dialog).getByLabelText('Date and time'), '2026-06-01T10:30');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create meeting' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v2/committees/c1/meetings', { title: 'Audit', scheduledAt: new Date('2026-06-01T10:30').toISOString() }));
  });
});

describe('MeetingDetailPage', () => {
  test('a locked meeting is completely read-only', async () => {
    signIn(MANAGE);
    open(meeting({ status: 'HELD', minutes: 'Final minutes', minutesLocked: true, minutesLockedAt: '2026-05-11T00:00:00Z' }));
    expect(await screen.findByText(/Minutes locked/)).toBeInTheDocument();
    expect(screen.getByText(/permanent record/)).toBeInTheDocument();
    expect(screen.getByLabelText('Minutes')).toBeDisabled();
    expect(screen.getByLabelText('Title')).toBeDisabled();
    for (const name of ['Save changes', 'Lock minutes', 'Record a decision', 'Edit', 'Delete', 'Mark as held', 'Cancel meeting']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.getByText('Approve budget')).toBeInTheDocument();
  });

  test('locking needs saved minutes and an explicit irreversible confirmation', async () => {
    signIn(MANAGE);
    post.mockResolvedValue({ data: meeting() });
    open(meeting({ status: 'HELD', minutes: 'We met.' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Lock minutes' }));
    const dialog = screen.getByRole('dialog', { name: 'Lock the minutes?' });
    expect(dialog).toHaveTextContent(/cannot be undone/);
    expect(post).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Go back' }));
    expect(post).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Lock minutes' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Lock permanently' }));
    expect(post).toHaveBeenCalledWith('/api/v2/committees/meetings/mt1/lock-minutes');
  });

  test('lock is disabled when there are no saved minutes or unsaved edits', async () => {
    signIn(MANAGE);
    open(meeting({ status: 'HELD', minutes: null }));
    expect(await screen.findByRole('button', { name: 'Lock minutes' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Minutes'), 'Draft');
    expect(screen.getByRole('button', { name: 'Lock minutes' })).toBeDisabled(); // typed but not saved
  });

  test('saving a held meeting sends the minutes; a scheduled one does not', async () => {
    signIn(MANAGE);
    put.mockResolvedValue({ data: {} });
    const { unmount } = open(meeting({ status: 'HELD', minutes: 'Old' }));
    const minutes = await screen.findByLabelText('Minutes');
    await userEvent.clear(minutes);
    await userEvent.type(minutes, 'New minutes');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/v2/committees/meetings/mt1', expect.objectContaining({ minutes: 'New minutes', title: 'Budget review' })));
    unmount();

    put.mockClear();
    open(meeting({ status: 'SCHEDULED' }));
    expect(await screen.findByText(/Minutes can be recorded once the meeting has been held/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0][1]).not.toHaveProperty('minutes');
  });

  test('the server message for an inconsistent vote is shown and the dialog stays open', async () => {
    signIn(MANAGE);
    post.mockRejectedValue(apiError('A decision cannot be approved without more votes for than against'));
    open(meeting({ status: 'HELD', decisions: [] }));
    await userEvent.click(await screen.findByRole('button', { name: 'Record a decision' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Decision'), 'Buy a new roof');
    await userEvent.selectOptions(within(dialog).getByLabelText('Outcome'), 'APPROVED');
    await userEvent.clear(within(dialog).getByLabelText('For'));
    await userEvent.type(within(dialog).getByLabelText('For'), '1');
    await userEvent.clear(within(dialog).getByLabelText('Against'));
    await userEvent.type(within(dialog).getByLabelText('Against'), '4');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save decision' }));
    expect(post).toHaveBeenCalledWith('/api/v2/committees/meetings/mt1/decisions', expect.objectContaining({ status: 'APPROVED', votesFor: 1, votesAgainst: 4 }));
    expect(await within(screen.getByRole('dialog')).findByText('A decision cannot be approved without more votes for than against')).toBeInTheDocument();
  });

  test('a decision needs a description and valid vote counts before anything is sent', async () => {
    signIn(MANAGE);
    open(meeting({ status: 'HELD', decisions: [] }));
    await userEvent.click(await screen.findByRole('button', { name: 'Record a decision' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save decision' }));
    expect(await within(dialog).findByText('Describe the decision.')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  test('deleting a decision asks first', async () => {
    signIn(MANAGE);
    del.mockResolvedValue({ data: undefined });
    open(meeting({ status: 'HELD' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(del).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(del).toHaveBeenCalledWith('/api/v2/committees/decisions/d1');
  });

  test('viewers without manage rights see the record but no controls', async () => {
    signIn(['committee:view']);
    open(meeting({ status: 'HELD', minutes: 'We met.' }));
    expect(await screen.findByLabelText('Minutes')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Lock minutes|Save changes|Record a decision|Mark as held/ })).not.toBeInTheDocument();
  });

  test('cancelling a scheduled meeting is confirmed first', async () => {
    signIn(MANAGE);
    post.mockResolvedValue({ data: {} });
    open(meeting());
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel meeting' }));
    expect(post).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel meeting' }));
    expect(post).toHaveBeenCalledWith('/api/v2/committees/meetings/mt1/cancel');
  });
});
