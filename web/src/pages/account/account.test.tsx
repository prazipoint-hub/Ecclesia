import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Sidebar } from '@/components/Layout/Sidebar';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { GivingList, GivingSummary, MyProfile, NotificationList } from '@/types/account';
import { apiClient } from '@/utils/api';
import { MyGivingPage } from './MyGivingPage';
import { MyProfilePage } from './MyProfilePage';
import { NotificationsPage } from './NotificationsPage';

vi.mock('@/utils/api', () => ({ apiClient: { get: vi.fn(), put: vi.fn() } }));
vi.mock('@/components/Layout/MainLayout', () => ({ MainLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));

const get = vi.mocked(apiClient.get);
const put = vi.mocked(apiClient.put);

const profile: MyProfile = {
  id: 'm1',
  membershipNumber: 'M-001',
  firstName: 'Ruth',
  middleName: null,
  lastName: 'Moyo',
  email: 'ruth@church.org',
  phone: null,
  address: null,
  gender: 'FEMALE',
  dateOfBirth: '1990-01-01T00:00:00.000Z',
  maritalStatus: 'SINGLE',
  membershipStatus: 'ACTIVE',
  joinDate: '2020-01-01T00:00:00.000Z',
  membershipDate: '2020-02-01T00:00:00.000Z',
  isDependent: false,
  church: { id: 'c1', name: 'Grace' },
  section: null,
  family: null,
} as unknown as MyProfile;

beforeEach(() => {
  get.mockReset();
  put.mockReset();
});

describe('MyProfilePage', () => {
  test('rejects an invalid email without calling the API', async () => {
    get.mockResolvedValue({ data: profile });
    renderWithProviders(<MyProfilePage />);
    const email = await screen.findByLabelText('Email');
    await waitFor(() => expect(email).toHaveValue('ruth@church.org'));
    await userEvent.clear(email);
    await userEvent.type(email, 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();
  });

  test('sends only changed fields and shows success', async () => {
    get.mockResolvedValue({ data: profile });
    put.mockResolvedValue({ data: { ...profile, phone: '0771' } });
    renderWithProviders(<MyProfilePage />);
    const phone = await screen.findByLabelText('Phone');
    await userEvent.type(phone, '0771');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Your profile has been updated.');
    expect(put).toHaveBeenCalledWith('/api/v2/me/profile', { phone: '0771' });
  });
});

describe('MyGivingPage', () => {
  const year = new Date().getFullYear();
  const summary: GivingSummary = {
    year,
    availableYears: [year, year - 1],
    totals: [{ currency: 'USD', total: 150, count: 2 }],
    byIncomeType: [{ incomeType: "TITHE", currency: "USD", total: 150 }],
    byMonth: [{ month: 1, currency: 'USD', total: 150 }],
  } as unknown as GivingSummary;
  const list: GivingList = {
    items: [
      { id: 'r1', source: 'CHURCH', receiptNumber: 'R-1', amount: 100, currency: 'USD', incomeType: 'TITHE', paymentMethod: 'CASH', status: 'ISSUED', issuedAt: `${year}-01-05T00:00:00.000Z`, fundName: 'General', sectionName: null },
      { id: 'r2', source: 'CHURCH', receiptNumber: 'R-2', amount: 50, currency: 'USD', incomeType: 'OFFERING', paymentMethod: 'CASH', status: 'VOIDED', issuedAt: `${year}-01-06T00:00:00.000Z`, fundName: 'General', sectionName: null },
    ],
    total: 2,
    page: 1,
    pageSize: 20,
    availableYears: [year, year - 1],
  } as unknown as GivingList;

  test('shows totals, rows, voided badge and refetches on year change', async () => {
    get.mockImplementation(async (url: string) => ({ data: url.endsWith('/summary') ? summary : list }));
    renderWithProviders(<MyGivingPage />);
    expect(await screen.findByText('R-1')).toBeInTheDocument();
    expect(screen.getByText('R-2')).toBeInTheDocument();
    expect(screen.getByText('Voided')).toBeInTheDocument();
    expect(screen.getByText('2 receipts')).toBeInTheDocument();

    await screen.findByRole('option', { name: String(year - 1) });
    await userEvent.selectOptions(screen.getByLabelText('Year'), String(year - 1));
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/api/v2/me/giving', { params: { year: year - 1, page: 1, pageSize: 20 } })
    );
  });
});

describe('NotificationsPage', () => {
  const data = (): NotificationList => ({
    items: [
      { id: 'n1', source: 'SYSTEM', type: 'GENERAL', title: 'Welcome', body: 'Hello', read: false, createdAt: '2026-01-01T00:00:00.000Z', actionUrl: null },
      { id: 'n2', source: 'SYSTEM', type: 'GENERAL', title: 'Second', body: 'Again', read: false, createdAt: '2026-01-02T00:00:00.000Z', actionUrl: null },
    ],
    total: 2,
    unreadCount: 2,
    page: 1,
    pageSize: 20,
  });

  test('marks one read', async () => {
    get.mockResolvedValue({ data: data() });
    put.mockResolvedValue({ data: undefined });
    renderWithProviders(<NotificationsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Mark "Welcome" as read' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/v2/me/notifications/n1/read'));
    expect(await screen.findByText('1 unread')).toBeInTheDocument();
  });

  test('marks all read', async () => {
    get.mockResolvedValue({ data: data() });
    put.mockResolvedValue({ data: undefined });
    renderWithProviders(<NotificationsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Mark all as read' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/v2/me/notifications/read-all'));
    expect(await screen.findByText('0 unread')).toBeInTheDocument();
  });
});

describe('Sidebar', () => {
  test('always shows My Account', () => {
    renderWithProviders(<Sidebar isOpen onClose={() => undefined} />);
    const link = within(screen.getByRole('navigation')).getByRole('link', { name: 'My Account' });
    expect(link).toHaveAttribute('href', '/my-account');
  });
});
