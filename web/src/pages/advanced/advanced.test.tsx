import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { Campaign, DocumentTemplate, IssuedDocument } from '@/types/advanced';
import type { User } from '@/types/auth';
import { apiClient } from '@/utils/api';
import { useAuthStore } from '@stores/authStore';
import { CalendarFeedsCard } from './CalendarFeedsCard';
import { CampaignDetailPage } from './CampaignDetailPage';
import { CampaignsPage } from './CampaignsPage';
import { GenerateForm, VoidModal } from './DocumentsPage';
import { PublicCampaignPage } from './PublicCampaignPage';

vi.mock('@/utils/api', () => ({ apiClient: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn(), defaults: { baseURL: 'https://api.example.org' } } }));
vi.mock('@/components/Layout/MainLayout', () => ({ MainLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));

const get = vi.mocked(apiClient.get);
const post = vi.mocked(apiClient.post);

const signIn = (permissions: string[]) =>
  useAuthStore.setState({ user: { id: 'u1', email: 'a@b.co', firstName: 'A', lastName: 'B', churchId: 'church-1', permissions, committees: [], sbus: [], organizationContexts: [] } as User });

const campaign: Campaign = {
  id: 'c1', name: 'New roof', slug: 'new-roof-ab12cd', description: null, status: 'ACTIVE', isPublic: true, fundId: 'f1', goalAmount: 1000, startDate: '2026-01-01T00:00:00Z',
  endDate: null, createdAt: '2026-01-01T00:00:00Z', raised: 250, gifts: 3, donors: 2, percent: 25,
};

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  useAuthStore.setState({ user: null });
});

describe('permission gating', () => {
  test('campaigns page shows no-access and makes no request without the permission', () => {
    signIn(['finance:view']);
    renderWithProviders(<CampaignsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('campaign:manage');
    expect(get).not.toHaveBeenCalled();
  });
});

describe('closing a campaign', () => {
  test('asks for confirmation before calling the server', async () => {
    signIn(['campaign:manage']);
    get.mockResolvedValue({ data: campaign });
    post.mockResolvedValue({ data: { ...campaign, status: 'CLOSED' } });
    renderWithProviders(<Routes><Route path="/campaigns/:id" element={<CampaignDetailPage />} /></Routes>, '/campaigns/c1');
    await userEvent.click(await screen.findByRole('button', { name: 'Close campaign' }));
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByText(/stops new gifts/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Yes, close campaign' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v2/campaigns/c1/close'));
  });

  test('cancelling the confirmation sends nothing', async () => {
    signIn(['campaign:manage']);
    get.mockResolvedValue({ data: campaign });
    renderWithProviders(<Routes><Route path="/campaigns/:id" element={<CampaignDetailPage />} /></Routes>, '/campaigns/c1');
    await userEvent.click(await screen.findByRole('button', { name: 'Close campaign' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(post).not.toHaveBeenCalled();
  });
});

describe('public campaign page', () => {
  test('shows progress and links to giving with the fund preselected, without signing in', async () => {
    get.mockResolvedValue({ data: { name: 'New roof', description: 'Fix it', fundId: 'f1', goalAmount: 1000, raised: 250, percent: 25, donors: 2, startDate: '2026-01-01T00:00:00Z', endDate: null, daysLeft: 12 } });
    renderWithProviders(<Routes><Route path="/campaign/:slug" element={<PublicCampaignPage />} /></Routes>, '/campaign/new-roof-ab12cd');
    expect(await screen.findByRole('heading', { name: 'New roof' })).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/api/v2/public/campaigns/new-roof-ab12cd');
    expect(screen.getByRole('link', { name: 'Give' })).toHaveAttribute('href', '/give?fundId=f1');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
    expect(screen.getByText(/12 day\(s\) left/)).toBeInTheDocument();
  });
});

describe('document generation', () => {
  const template: DocumentTemplate = { id: 't1', type: 'CERTIFICATE', name: 'Baptism', title: 'Certificate for {{memberName}}', body: 'Baptised on {{field.baptismDate}} at {{field.place}} ({{field.baptismDate}})', isActive: true };
  const off: DocumentTemplate = { ...template, id: 't2', name: 'Old', isActive: false };

  test('shows one input per field placeholder, only for active templates, and sends the values', async () => {
    signIn(['document:generate']);
    post.mockResolvedValue({ data: { serial: 'DOC-2026-AAAA1111' } });
    renderWithProviders(<GenerateForm templates={[template, off]} />);
    expect(screen.queryByText('Old (Certificate)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Field:/)).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Template'), 't1');
    expect(screen.getAllByLabelText(/Field:/)).toHaveLength(2);
    await userEvent.type(screen.getByLabelText('Field: baptismDate'), '1 May');
    await userEvent.type(screen.getByLabelText('Field: place'), 'Harare');
    await userEvent.type(screen.getByLabelText(/Member ID/), 'm1');
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v2/documents/generate', { templateId: 't1', memberId: 'm1', fields: { baptismDate: '1 May', place: 'Harare' } }));
    expect(await screen.findByText(/DOC-2026-AAAA1111/)).toBeInTheDocument();
  });
});

describe('voiding a document', () => {
  const doc: IssuedDocument = { id: 'd1', type: 'LETTER', serial: 'DOC-2026-AAAA1111', title: 'T', memberId: null, voidedAt: null, createdAt: '2026-01-01T00:00:00Z' };

  test('requires a reason of at least 5 characters', async () => {
    renderWithProviders(<VoidModal doc={doc} onClose={() => undefined} />);
    await userEvent.type(screen.getByLabelText('Reason for voiding'), 'no');
    await userEvent.click(screen.getByRole('button', { name: 'Void document' }));
    expect(await screen.findByText(/at least 5 characters/)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Reason for voiding'), ' typo in name');
    await userEvent.click(screen.getByRole('button', { name: 'Void document' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v2/documents/d1/void', { reason: 'no typo in name' }));
  });
});

describe('calendar subscription', () => {
  test('the full link is shown once after creation, built on the API origin', async () => {
    get.mockResolvedValue({ data: [] });
    post.mockResolvedValue({ data: { id: 'f1', label: null, path: '/api/v2/public/calendar/SECRET.ics', token: 'SECRET' } });
    renderWithProviders(<CalendarFeedsCard />);
    await userEvent.click(screen.getByRole('button', { name: 'Create link' }));
    expect(await screen.findByText('https://api.example.org/api/v2/public/calendar/SECRET.ics')).toBeInTheDocument();
    expect(screen.getByText(/shown only once/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'I have copied it' }));
    expect(screen.queryByText(/SECRET/)).not.toBeInTheDocument();
  });

  test('listed links never show a secret and can be revoked', async () => {
    get.mockResolvedValue({ data: [{ id: 'f9', label: 'Phone', createdAt: '2026-01-01T00:00:00Z', lastUsedAt: null, revokedAt: null }, { id: 'f8', label: 'Old', createdAt: '2026-01-01T00:00:00Z', lastUsedAt: null, revokedAt: '2026-02-01T00:00:00Z' }] });
    const del = vi.mocked(apiClient.delete);
    del.mockResolvedValue({ data: { revoked: true } });
    renderWithProviders(<CalendarFeedsCard />);
    expect(await screen.findByText(/Phone/)).toBeInTheDocument();
    expect(screen.queryByText(/Old/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('/api/v2/calendar/feeds/f9'));
  });
});
