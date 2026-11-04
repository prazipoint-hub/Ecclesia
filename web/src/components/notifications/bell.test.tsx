import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { NotificationList } from '@/types/account';
import { apiClient } from '@/utils/api';
import { NotificationBell } from './NotificationBell';

vi.mock('@/utils/api', () => ({ apiClient: { get: vi.fn(), put: vi.fn() } }));

const get = vi.mocked(apiClient.get);
const put = vi.mocked(apiClient.put);

const list = (overrides: Partial<NotificationList> = {}): NotificationList => ({
  items: [
    { id: 'n1', source: 'SYSTEM', type: 'BROADCAST', title: 'Sunday service moved', body: 'Starts at 9', read: false, createdAt: '2026-04-02T10:00:00Z', actionUrl: null },
    { id: 'n2', source: 'SYSTEM', type: 'PAYMENT_RECEIVED', title: 'Thank you for your gift', body: 'Receipt', read: true, createdAt: '2026-04-01T10:00:00Z', actionUrl: null },
  ],
  total: 2,
  unreadCount: 1,
  page: 1,
  pageSize: 5,
  ...overrides,
});

beforeEach(() => {
  get.mockReset();
  put.mockReset();
});

describe('NotificationBell', () => {
  test('shows the unread count on the badge and in the accessible name', async () => {
    get.mockResolvedValue({ data: list({ unreadCount: 3 }) });
    renderWithProviders(<NotificationBell />);
    expect(await screen.findByRole('button', { name: 'Notifications, 3 unread' })).toBeInTheDocument();
    expect(screen.getByTestId('unread-badge')).toHaveTextContent('3');
    expect(get).toHaveBeenCalledWith('/api/v2/me/notifications', { params: { page: 1, pageSize: 5 } });
  });

  test('hides the badge when everything is read', async () => {
    get.mockResolvedValue({ data: list({ unreadCount: 0 }) });
    renderWithProviders(<NotificationBell />);
    await screen.findByRole('button', { name: 'Notifications' });
    expect(screen.queryByTestId('unread-badge')).not.toBeInTheDocument();
  });

  test('clicking an unread item marks it read and refreshes the count', async () => {
    get.mockResolvedValueOnce({ data: list() }).mockResolvedValue({ data: list({ unreadCount: 0 }) });
    put.mockResolvedValue({ data: undefined });
    renderWithProviders(<NotificationBell />);
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));
    await userEvent.click(screen.getByRole('button', { name: /Sunday service moved/ }));
    expect(put).toHaveBeenCalledWith('/api/v2/me/notifications/n1/read');
    await waitFor(() => expect(screen.queryByTestId('unread-badge')).not.toBeInTheDocument());
  });

  test('already-read items do not call the API', async () => {
    get.mockResolvedValue({ data: list() });
    renderWithProviders(<NotificationBell />);
    await userEvent.click(await screen.findByRole('button', { name: /Notifications/ }));
    await userEvent.click(screen.getByRole('button', { name: /Thank you for your gift/ }));
    expect(put).not.toHaveBeenCalled();
  });

  test('mark all read, view all link, and Escape to close', async () => {
    get.mockResolvedValue({ data: list() });
    put.mockResolvedValue({ data: undefined });
    renderWithProviders(<NotificationBell />);
    await userEvent.click(await screen.findByRole('button', { name: /Notifications/ }));
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute('href', '/my-account/notifications');
    await userEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(put).toHaveBeenCalledWith('/api/v2/me/notifications/read-all');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: 'Recent notifications' })).not.toBeInTheDocument();
  });
});
