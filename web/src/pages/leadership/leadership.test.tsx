import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { apiError, signIn } from '@/test/peopleTestUtils';
import type { Appointment, TermItem } from '@/types/people';
import { apiClient } from '@/utils/api';
import { useAuthStore } from '@stores/authStore';
import { LeadershipPage } from './LeadershipPage';

vi.mock('@/utils/api', () => ({ apiClient: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock('@/components/Layout/MainLayout', () => ({ MainLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));

const get = vi.mocked(apiClient.get);
const put = vi.mocked(apiClient.put);
const post = vi.mocked(apiClient.post);

const appointment = (over: Partial<Appointment> = {}): Appointment => ({
  id: 'a1', member: { id: 'm1', firstName: 'Ada', lastName: 'Moyo' }, role: { id: 'r1', name: 'Treasurer' }, committee: { id: 'c1', name: 'Finance' }, position: null,
  startDate: '2024-01-01T00:00:00Z', endDate: null, termCount: 1, currentTerm: { id: 't1', termNumber: 1, startDate: '2024-01-01T00:00:00Z', plannedEndDate: '2027-01-01T00:00:00Z' }, ...over,
});
const term = (over: Partial<TermItem> = {}): TermItem => ({
  id: 't1', assignmentId: 'a1', termNumber: 1, status: 'ACTIVE', startDate: '2024-01-01T00:00:00Z', plannedEndDate: '2026-12-01T00:00:00Z', endDate: null, successorId: null, notes: null,
  member: { id: 'm1', firstName: 'Ada', lastName: 'Moyo' }, roleName: 'Treasurer', committeeName: 'Finance', position: null, daysRemaining: 20, ...over,
});

const serve = (appointments: Appointment[], terms: TermItem[] = [term()]) =>
  get.mockImplementation(async (url: string) => {
    if (url === '/api/v2/leadership/assignments') return { data: { items: appointments, total: appointments.length, page: 1, pageSize: 25 } };
    if (url === '/api/v2/leadership/terms') return { data: { items: terms, total: terms.length, page: 1, pageSize: 25 } };
    if (url === '/api/v2/members/search') return { data: { items: [{ id: 'm2', firstName: 'Tendai', lastName: 'Dube', membershipNumber: 'M2' }, { id: 'm1', firstName: 'Ada', lastName: 'Moyo', membershipNumber: 'M1' }], total: 2, page: 1, pageSize: 8 } };
    throw new Error(`unexpected GET ${url}`);
  });

beforeEach(() => {
  get.mockReset();
  put.mockReset();
  post.mockReset();
  useAuthStore.setState({ user: null });
});

describe('LeadershipPage', () => {
  test('without leadership:term:manage nothing is requested', () => {
    signIn([]);
    renderWithProviders(<LeadershipPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('leadership:term:manage');
    expect(get).not.toHaveBeenCalled();
  });

  test('ending a term warns that authority ends too, and sends the successor and outcome', async () => {
    signIn(['leadership:term:manage']);
    serve([appointment()]);
    put.mockResolvedValue({ data: {} });
    renderWithProviders(<LeadershipPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'End term' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('note')).toHaveTextContent(/ends this person's authority/);

    await userEvent.selectOptions(within(dialog).getByLabelText('How did it end?'), 'TERMINATED');
    await userEvent.type(within(dialog).getByLabelText('Search members for a successor'), 'ten');
    const results = within(await within(dialog).findByRole('list', { name: 'Successor results' }));
    expect(results.queryByText(/Ada Moyo/)).not.toBeInTheDocument(); // the outgoing leader cannot succeed themselves
    await userEvent.click(results.getByRole('button', { name: /Tendai Dube/ }));
    expect(within(dialog).getByText('Tendai Dube')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'End term' }));
    expect(put).toHaveBeenCalledWith('/api/v2/leadership/terms/t1/end', { status: 'TERMINATED', successorId: 'm2' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('a rejected end is explained and the dialog stays open', async () => {
    signIn(['leadership:term:manage']);
    serve([appointment()]);
    put.mockRejectedValue(apiError('This term is already completed', 409));
    renderWithProviders(<LeadershipPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'End term' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'End term' }));
    expect(await within(screen.getByRole('dialog')).findByText('This term is already completed')).toBeInTheDocument();
  });

  test('an appointment without an active term offers to start one', async () => {
    signIn(['leadership:term:manage']);
    serve([appointment({ currentTerm: null, termCount: 2 })]);
    post.mockResolvedValue({ data: {} });
    renderWithProviders(<LeadershipPage />);
    expect(await screen.findByText(/No active term \(2 past\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Start term' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Planned end date'), '2029-01-01');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Start term' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v2/leadership/assignments/a1/terms', { plannedEndDate: new Date('2029-01-01').toISOString() }));
  });

  test('a conflict when starting a term (term limit) is shown', async () => {
    signIn(['leadership:term:manage']);
    serve([appointment({ currentTerm: null })]);
    post.mockRejectedValue(apiError('Term limit reached: this appointment may serve at most 2 term(s)', 409));
    renderWithProviders(<LeadershipPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Start term' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Start term' }));
    expect(await screen.findByText(/Term limit reached/)).toBeInTheDocument();
  });

  test('the terms tab filters expiring terms and highlights those ending soon', async () => {
    signIn(['leadership:term:manage']);
    serve([appointment()]);
    renderWithProviders(<LeadershipPage />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Terms' }));
    expect(await screen.findByText('20 days left')).toHaveClass('text-red-600');
    await userEvent.selectOptions(screen.getByLabelText('Ending within'), '90');
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/api/v2/leadership/terms', { params: { expiringWithinDays: '90', page: 1, pageSize: 25 } }));
  });

  test('completed terms have no end action', async () => {
    signIn(['leadership:term:manage']);
    serve([], [term({ status: 'COMPLETED', endDate: '2026-01-01T00:00:00Z', daysRemaining: null })]);
    renderWithProviders(<LeadershipPage />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Terms' }));
    await within(await screen.findByRole('table')).findByText('Completed');
    expect(screen.queryByRole('button', { name: 'End term' })).not.toBeInTheDocument();
  });
});
