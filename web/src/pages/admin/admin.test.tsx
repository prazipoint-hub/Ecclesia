import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Sidebar } from '@/components/Layout/Sidebar';
import { NotificationPreferencesPage } from '@/pages/account/NotificationPreferencesPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { Broadcast, PreferencesResponse, TemplateList } from '@/types/notifications';
import type { User } from '@/types/auth';
import { apiClient } from '@/utils/api';
import { useAuthStore } from '@stores/authStore';
import { BroadcastsPage } from './BroadcastsPage';
import { TemplatesPage } from './TemplatesPage';

vi.mock('@/utils/api', () => ({ apiClient: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock('@/components/Layout/MainLayout', () => ({ MainLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));

const get = vi.mocked(apiClient.get);
const put = vi.mocked(apiClient.put);
const post = vi.mocked(apiClient.post);

const signIn = (permissions: string[]) =>
  useAuthStore.setState({ user: { id: 'u1', email: 'a@b.co', firstName: 'A', lastName: 'B', churchId: 'church-1', permissions, committees: [], sbus: [], organizationContexts: [] } as User });

const draft: Broadcast = {
  id: 'b1', title: 'Harvest thanksgiving', body: 'Join us', category: 'ANNOUNCEMENTS', audience: { type: 'ALL' }, channels: ['IN_APP', 'EMAIL'],
  status: 'DRAFT', scheduledAt: null, sentAt: null, recipientCount: 0, deliveredCount: 0, failedCount: 0, skippedCount: 0, createdAt: '2026-04-01T00:00:00Z',
};

const prefs: PreferencesResponse = {
  categories: [
    {
      category: 'GIVING',
      channels: [
        { channel: 'IN_APP', enabled: true, isDefault: true, available: true },
        { channel: 'EMAIL', enabled: true, isDefault: true, available: true },
        { channel: 'SMS', enabled: false, isDefault: true, available: false },
        { channel: 'PUSH', enabled: false, isDefault: true, available: false },
      ],
    },
  ],
};

beforeEach(() => {
  get.mockReset();
  put.mockReset();
  post.mockReset();
  useAuthStore.setState({ user: null });
});

describe('NotificationPreferencesPage', () => {
  test('disables channels that are not available and says why', async () => {
    get.mockResolvedValue({ data: prefs });
    renderWithProviders(<NotificationPreferencesPage />);
    expect(await screen.findByLabelText('Giving & receipts via SMS')).toBeDisabled();
    expect(screen.getByLabelText('Giving & receipts via Push')).toBeDisabled();
    expect(screen.getByText('not available yet')).toBeInTheDocument();
    expect(screen.getByText('coming soon')).toBeInTheDocument();
    expect(screen.getByLabelText('Giving & receipts via Email')).toBeEnabled();
  });

  test('toggling saves immediately', async () => {
    get.mockResolvedValue({ data: prefs });
    const saved: PreferencesResponse = { categories: [{ category: 'GIVING', channels: prefs.categories[0].channels.map((c) => (c.channel === 'EMAIL' ? { ...c, enabled: false, isDefault: false } : c)) }] };
    put.mockResolvedValue({ data: saved });
    renderWithProviders(<NotificationPreferencesPage />);
    await userEvent.click(await screen.findByLabelText('Giving & receipts via Email'));
    expect(put).toHaveBeenCalledWith('/api/v2/notifications/preferences', { preferences: [{ category: 'GIVING', channel: 'EMAIL', enabled: false }] });
    await waitFor(() => expect(screen.getByLabelText('Giving & receipts via Email')).not.toBeChecked());
  });

  test('rolls back and explains when saving fails', async () => {
    get.mockResolvedValue({ data: prefs });
    put.mockRejectedValue(new Error('network'));
    renderWithProviders(<NotificationPreferencesPage />);
    await userEvent.click(await screen.findByLabelText('Giving & receipts via Email'));
    expect(await screen.findByText(/Your change was not saved/)).toBeInTheDocument();
    expect(screen.getByLabelText('Giving & receipts via Email')).toBeChecked();
  });
});

describe('TemplatesPage', () => {
  const templates: TemplateList = { variables: ['firstName', 'lastName', 'churchName'], items: [] };

  test('placeholder chips insert at the cursor', async () => {
    signIn(['notification:template:manage']);
    get.mockResolvedValue({ data: templates });
    renderWithProviders(<TemplatesPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'New template' }));
    const dialog = screen.getByRole('dialog');
    const body = within(dialog).getByLabelText('Message');
    await userEvent.type(body, 'Dear ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'firstName' }));
    expect(body).toHaveValue('Dear {{firstName}}');
  });

  test('requires every field before saving', async () => {
    signIn(['notification:template:manage']);
    get.mockResolvedValue({ data: templates });
    renderWithProviders(<TemplatesPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'New template' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save template' }));
    expect(await screen.findByText('Enter a name.')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  test('without the permission nothing is requested', () => {
    signIn([]);
    renderWithProviders(<TemplatesPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('notification:template:manage');
    expect(get).not.toHaveBeenCalled();
  });
});

describe('BroadcastsPage', () => {
  const routes = (extra: Record<string, unknown> = {}) =>
    get.mockImplementation(async (url: string) => {
      if (url in extra) return { data: extra[url] };
      if (url === '/api/v2/notifications/broadcasts') return { data: { items: [draft], total: 1, page: 1, pageSize: 20 } };
      if (url === '/api/v2/notifications/broadcasts/b1') return { data: draft };
      if (url === '/api/v2/sections') return { data: { sections: [{ id: 's1', name: 'East' }] } };
      if (url === '/api/v2/notifications/templates') return { data: { variables: [], items: [{ id: 't1', name: 'Reminder', subject: 'Reminder', body: 'Hello {{firstName}}', createdAt: '', updatedAt: '' }] } };
      throw new Error(`unexpected GET ${url}`);
    });

  test('form validation blocks an empty draft and an empty audience', async () => {
    signIn(['notification:broadcast:create']);
    routes();
    post.mockResolvedValue({ data: { recipients: 12 } });
    renderWithProviders(<BroadcastsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'New broadcast' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('Enter a title.')).toBeInTheDocument();
    expect(screen.getByText('Enter the message.')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Title'), 'Hi');
    await userEvent.type(screen.getByLabelText('Message'), 'Body');
    await userEvent.selectOptions(screen.getByLabelText('Audience'), 'SECTIONS');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('Choose at least one group, or send to everyone.')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalledWith('/api/v2/notifications/broadcasts', expect.anything());
  });

  test('SMS is disabled with a reason, and a valid form creates the draft', async () => {
    signIn(['notification:broadcast:create']);
    routes();
    post.mockImplementation(async (url: string) => (url.endsWith('audience-preview') ? { data: { recipients: 12 } } : { data: draft }));
    renderWithProviders(<BroadcastsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'New broadcast' }));
    expect(screen.getByLabelText(/SMS/)).toBeDisabled();
    expect(screen.getByText('(No SMS provider configured)')).toBeInTheDocument();
    expect(await screen.findByText('12 recipients')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Title'), 'Harvest thanksgiving');
    await userEvent.type(screen.getByLabelText('Message'), 'Join us');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/api/v2/notifications/broadcasts', {
        title: 'Harvest thanksgiving', body: 'Join us', category: 'ANNOUNCEMENTS', audience: { type: 'ALL' }, channels: ['IN_APP', 'EMAIL'],
      })
    );
  });

  test('send asks for confirmation showing the recipient count before posting', async () => {
    signIn(['notification:broadcast:create', 'notification:broadcast:send']);
    routes();
    post.mockImplementation(async (url: string) =>
      url.endsWith('audience-preview') ? { data: { recipients: 250 } } : { data: { ...draft, status: 'SENDING' } }
    );
    renderWithProviders(<BroadcastsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Open Harvest thanksgiving' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Send now' }));

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/250 members/)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalledWith('/api/v2/notifications/broadcasts/b1/send', undefined);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Send now' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v2/notifications/broadcasts/b1/send', undefined));
    expect(await screen.findByText(/Sending… this page updates automatically/)).toBeInTheDocument();
  });

  test('without the send permission there are no send controls', async () => {
    signIn(['notification:broadcast:create']);
    routes();
    renderWithProviders(<BroadcastsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Open Harvest thanksgiving' }));
    await screen.findByRole('button', { name: 'Edit' });
    expect(screen.queryByRole('button', { name: 'Send now' })).not.toBeInTheDocument();
  });

  test('picking a template fills the title and message', async () => {
    signIn(['notification:broadcast:create', 'notification:template:manage']);
    routes();
    post.mockResolvedValue({ data: { recipients: 1 } });
    renderWithProviders(<BroadcastsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'New broadcast' }));
    await userEvent.selectOptions(await screen.findByLabelText('Start from a template'), 't1');
    expect(screen.getByLabelText('Title')).toHaveValue('Reminder');
    expect(screen.getByLabelText('Message')).toHaveValue('Hello {{firstName}}');
  });
});

describe('Sidebar admin links', () => {
  test('only appear with the matching permission', () => {
    signIn(['notification:broadcast:create']);
    renderWithProviders(<Sidebar isOpen onClose={() => undefined} />);
    const nav = within(screen.getByRole('navigation'));
    expect(nav.getByRole('link', { name: 'Broadcasts' })).toHaveAttribute('href', '/admin/broadcasts');
    expect(nav.queryByRole('link', { name: 'Templates' })).not.toBeInTheDocument();
  });
});
