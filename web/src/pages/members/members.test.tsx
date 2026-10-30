import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Sidebar } from '@/components/Layout/Sidebar';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { ReactNode } from 'react';
import { apiError, renderAt, signIn, stubDownloads } from '@/test/peopleTestUtils';
import type { DirectoryMember, ImportPreview, MemberDetail } from '@/types/people';
import { apiClient } from '@/utils/api';
import { useAuthStore } from '@stores/authStore';
import { MemberDetailPage } from './MemberDetailPage';
import { MemberDirectoryPage } from './MemberDirectoryPage';
import { MemberImportPage } from './MemberImportPage';

vi.mock('@/utils/api', () => ({ apiClient: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock('@/components/Layout/MainLayout', () => ({ MainLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));

const get = vi.mocked(apiClient.get);
const put = vi.mocked(apiClient.put);
const post = vi.mocked(apiClient.post);

const member = (over: Partial<DirectoryMember> = {}): DirectoryMember => ({
  id: 'm1', membershipNumber: 'M20260001', firstName: 'Ada', middleName: null, lastName: 'Moyo', email: 'ada@example.com', phone: null, gender: 'FEMALE',
  membershipStatus: 'ACTIVE', joinDate: '2024-01-05T00:00:00Z', archivedAt: null, isDependent: false, sectionId: 's1', sectionName: 'East', ...over,
});

const searchCalls = () => get.mock.calls.filter(([url]) => url === '/api/v2/members/search').map(([, config]) => (config as { params: Record<string, unknown> }).params);

beforeEach(() => {
  vi.restoreAllMocks();
  get.mockReset();
  put.mockReset();
  post.mockReset();
  useAuthStore.setState({ user: null });
  get.mockImplementation(async (url: string) => {
    if (url === '/api/v2/members/search') return { data: { items: [member()], total: 1, page: 1, pageSize: 25 } };
    if (url === '/api/v2/sections') return { data: { sections: [{ id: 's1', name: 'East' }] } };
    if (url === '/api/v2/members/imports') return { data: [] };
    throw new Error(`unexpected GET ${url}`);
  });
});

describe('MemberDirectoryPage', () => {
  test('without member:view nothing is requested', () => {
    signIn([]);
    renderWithProviders(<MemberDirectoryPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('member:view');
    expect(get).not.toHaveBeenCalled();
  });

  test('loads with default filters and no search term', async () => {
    signIn(['member:view']);
    renderWithProviders(<MemberDirectoryPage />);
    expect(await screen.findByRole('link', { name: 'Ada Moyo' })).toHaveAttribute('href', '/members/m1');
    expect(searchCalls()[0]).toEqual({ archived: 'exclude', sort: 'name', page: 1, pageSize: 25 });
  });

  test('typing is debounced into a single search request', async () => {
    signIn(['member:view']);
    renderWithProviders(<MemberDirectoryPage />);
    await screen.findByRole('link', { name: 'Ada Moyo' });
    const before = searchCalls().length;
    await userEvent.type(screen.getByLabelText('Search members'), 'ada moyo');
    expect(searchCalls().length).toBe(before); // nothing sent while typing
    await waitFor(() => expect(searchCalls().at(-1)).toMatchObject({ q: 'ada moyo', page: 1 }));
    expect(searchCalls().length).toBe(before + 1);
    expect(searchCalls().some((p) => p.q === 'ada')).toBe(false);
  });

  test('filters are sent to the server and reset to page 1', async () => {
    signIn(['member:view']);
    renderWithProviders(<MemberDirectoryPage />);
    await screen.findByRole('link', { name: 'Ada Moyo' });
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'INACTIVE');
    await waitFor(() => expect(searchCalls().at(-1)).toMatchObject({ status: 'INACTIVE', page: 1 }));
    await userEvent.selectOptions(screen.getByLabelText('Archived'), 'only');
    await waitFor(() => expect(searchCalls().at(-1)).toMatchObject({ status: 'INACTIVE', archived: 'only' }));
    await userEvent.selectOptions(await screen.findByLabelText('Section'), 's1');
    await waitFor(() => expect(searchCalls().at(-1)).toMatchObject({ sectionId: 's1' }));
  });

  test('archived members are marked, and the empty state is explained', async () => {
    signIn(['member:view']);
    get.mockImplementation(async (url: string) =>
      url === '/api/v2/members/search' ? { data: { items: [member({ archivedAt: '2026-03-01T00:00:00Z' })], total: 1, page: 1, pageSize: 25 } } : { data: { sections: [] } }
    );
    renderWithProviders(<MemberDirectoryPage />);
    expect(await screen.findByText('Archived')).toBeInTheDocument();
  });

  test('export and import controls follow permissions; export downloads the filtered CSV', async () => {
    signIn(['member:view']);
    const { unmount } = renderWithProviders(<MemberDirectoryPage />);
    await screen.findByRole('link', { name: 'Ada Moyo' });
    expect(screen.queryByRole('button', { name: 'Export CSV' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Import/ })).not.toBeInTheDocument();
    unmount();

    signIn(['member:view', 'member:export', 'member:import']);
    stubDownloads();
    renderWithProviders(<MemberDirectoryPage />);
    await userEvent.selectOptions(await screen.findByLabelText('Status'), 'ACTIVE');
    get.mockImplementation(async (url: string) =>
      url === '/api/v2/members/export' ? { data: new Blob(['x']) } : { data: { items: [member()], total: 1, page: 1, pageSize: 25, sections: [] } }
    );
    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/v2/members/export', expect.objectContaining({ responseType: 'blob', params: expect.objectContaining({ status: 'ACTIVE' }) })));
    expect(screen.getByRole('link', { name: /Import/ })).toHaveAttribute('href', '/members/import');
  });
});

describe('MemberImportPage', () => {
  const csv = 'firstName,lastName\nAda,Moyo\n,Dube\n';
  const upload = async (name = 'members.csv', type = 'text/csv', setup: { upload: typeof userEvent.upload } = userEvent) => {
    await setup.upload(await screen.findByLabelText('CSV file'), new File([csv], name, { type }));
  };
  const preview = (over: Partial<ImportPreview> = {}): ImportPreview => ({
    totalRows: 2, validRows: 1, errorCount: 1, errors: [{ row: 3, message: 'firstName: first name is required' }], ignoredColumns: ['nickname'], ...over,
  });

  test('without member:import nothing is requested', () => {
    signIn([]);
    renderWithProviders(<MemberImportPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('member:import');
    expect(get).not.toHaveBeenCalled();
  });

  test('previews the file, lists problem rows, and only imports once invalid rows are explicitly skipped', async () => {
    signIn(['member:import']);
    post.mockResolvedValueOnce({ data: preview() });
    renderWithProviders(<MemberImportPage />);
    await upload();
    await userEvent.click(screen.getByRole('button', { name: 'Check file' }));

    expect(post).toHaveBeenCalledWith('/api/v2/members/import/preview', csv, { headers: { 'Content-Type': 'text/csv' } });
    const table = within(await screen.findByRole('table', { name: 'Rows with problems' }));
    expect(table.getByText('3')).toBeInTheDocument();
    expect(table.getByText('firstName: first name is required')).toBeInTheDocument();
    expect(screen.getByText(/Ignored columns: nickname/)).toBeInTheDocument();

    const importButton = screen.getByRole('button', { name: /^Import/ });
    expect(importButton).toBeDisabled();
    await userEvent.click(screen.getByLabelText(/Skip the 1 problem row/));
    expect(importButton).toBeEnabled();

    post.mockResolvedValueOnce({ data: { id: 'i1', status: 'PARTIAL', totalRows: 2, imported: 1, skipped: 1, errors: [] } });
    await userEvent.click(importButton);
    expect(post).toHaveBeenLastCalledWith('/api/v2/members/import', csv, { headers: { 'Content-Type': 'text/csv' }, params: { fileName: 'members.csv', skipInvalid: true } });
    expect(await screen.findByText(/Imported 1 of 2 rows; 1 skipped/)).toBeInTheDocument();
  });

  test('a clean file can be imported without skipping anything', async () => {
    signIn(['member:import']);
    post.mockResolvedValueOnce({ data: preview({ totalRows: 2, validRows: 2, errorCount: 0, errors: [], ignoredColumns: [] }) });
    renderWithProviders(<MemberImportPage />);
    await upload();
    await userEvent.click(screen.getByRole('button', { name: 'Check file' }));
    const importButton = await screen.findByRole('button', { name: 'Import 2 members' });
    expect(importButton).toBeEnabled();
    expect(screen.queryByLabelText(/Skip the/)).not.toBeInTheDocument();
    post.mockResolvedValueOnce({ data: { id: 'i1', status: 'COMPLETED', totalRows: 2, imported: 2, skipped: 0, errors: [] } });
    await userEvent.click(importButton);
    expect(post).toHaveBeenLastCalledWith('/api/v2/members/import', csv, expect.objectContaining({ params: { fileName: 'members.csv', skipInvalid: false } }));
  });

  test('a server rejection of the import is shown and nothing is reported as imported', async () => {
    signIn(['member:import']);
    post.mockResolvedValueOnce({ data: preview({ validRows: 2, errorCount: 0, errors: [], ignoredColumns: [] }) });
    renderWithProviders(<MemberImportPage />);
    await upload();
    await userEvent.click(screen.getByRole('button', { name: 'Check file' }));
    post.mockRejectedValueOnce(apiError('1 row(s) have problems. Nothing was imported.', 409));
    await userEvent.click(await screen.findByRole('button', { name: 'Import 2 members' }));
    expect(await screen.findByText(/Nothing was imported/)).toBeInTheDocument();
    expect(screen.queryByText(/^Imported/)).not.toBeInTheDocument();
  });

  test('rejects non-CSV files before sending anything', async () => {
    signIn(['member:import']);
    renderWithProviders(<MemberImportPage />);
    await upload('members.xlsx', 'application/vnd.ms-excel', userEvent.setup({ applyAccept: false }));
    expect(await screen.findByText('Choose a .csv file.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check file' })).toBeDisabled();
    expect(post).not.toHaveBeenCalled();
  });

  test('the template download is generated client-side', async () => {
    signIn(['member:import']);
    const createObjectURL = stubDownloads();
    renderWithProviders(<MemberImportPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Download template' }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });
});

describe('MemberDetailPage', () => {
  const detail = (over: Partial<MemberDetail> = {}): MemberDetail => ({
    id: 'm1', membershipNumber: 'M20260001', firstName: 'Ada', middleName: null, lastName: 'Moyo', email: 'ada@example.com', phone: null, gender: 'FEMALE', dateOfBirth: null,
    address: null, maritalStatus: null, membershipStatus: 'ACTIVE', joinDate: '2024-01-05T00:00:00Z', membershipDate: '2024-01-05T00:00:00Z', archivedAt: null, isDependent: false, ...over,
  });
  const load = (m: MemberDetail) => get.mockImplementation(async () => ({ data: m }));

  test('archiving asks for confirmation first', async () => {
    signIn(['member:view', 'member:archive']);
    load(detail());
    put.mockResolvedValue({ data: { id: 'm1', archivedAt: '2026-04-01T00:00:00Z' } });
    renderAt('/members/:id', '/members/m1', <MemberDetailPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Archive member' }));
    const dialog = screen.getByRole('dialog', { name: 'Archive this member?' });
    expect(dialog).toHaveTextContent(/can no longer sign in/);
    expect(put).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Archive' }));
    expect(put).toHaveBeenCalledWith('/api/v2/members/m1/archive');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('cancelling the confirmation changes nothing', async () => {
    signIn(['member:view', 'member:archive']);
    load(detail());
    renderAt('/members/:id', '/members/m1', <MemberDetailPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Archive member' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(put).not.toHaveBeenCalled();
  });

  test('an archived member offers restore', async () => {
    signIn(['member:view', 'member:archive']);
    load(detail({ archivedAt: '2026-03-01T00:00:00Z' }));
    put.mockResolvedValue({ data: {} });
    renderAt('/members/:id', '/members/m1', <MemberDetailPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Restore member' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Restore' }));
    expect(put).toHaveBeenCalledWith('/api/v2/members/m1/restore');
  });

  test('the server refusing the archive is explained inside the dialog', async () => {
    signIn(['member:view', 'member:archive']);
    load(detail());
    put.mockRejectedValue(apiError('You cannot archive your own member record', 409));
    renderAt('/members/:id', '/members/m1', <MemberDetailPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Archive member' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Archive' }));
    expect(await within(screen.getByRole('dialog')).findByText('You cannot archive your own member record')).toBeInTheDocument();
  });

  test('without member:archive there is no archive button', async () => {
    signIn(['member:view']);
    load(detail());
    renderAt('/members/:id', '/members/m1', <MemberDetailPage />);
    await screen.findByRole('heading', { name: 'Ada Moyo' });
    expect(screen.queryByRole('button', { name: /Archive|Restore/ })).not.toBeInTheDocument();
  });
});

describe('Sidebar people links', () => {
  test('each link appears only with its permission', () => {
    signIn(['member:view', 'visitor:view']);
    renderWithProviders(<Sidebar isOpen onClose={() => undefined} />);
    const nav = within(screen.getByRole('navigation'));
    expect(nav.getByRole('link', { name: 'Directory' })).toHaveAttribute('href', '/members/search');
    expect(nav.getByRole('link', { name: 'Visitors' })).toHaveAttribute('href', '/visitors');
    expect(nav.queryByRole('link', { name: 'Import members' })).not.toBeInTheDocument();
    expect(nav.queryByRole('link', { name: 'Leadership' })).not.toBeInTheDocument();
  });
});

