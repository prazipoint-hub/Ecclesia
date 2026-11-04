import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, Upload } from 'lucide-react';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormSelect } from '@/components/forms/FormSelect';
import { SearchInput } from '@/components/forms/SearchInput';
import { EmptyBlock, ErrorBlock, LoadingBlock, Pagination, formatDate, secondaryBtn } from '@/pages/account/shared';
import { AdminHeader, NoAccess } from '@/pages/admin/adminShared';
import { useAuthStore } from '@stores/authStore';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import { can, fullName, type ArchiveFilter, type DirectoryFilters, type DirectoryPage, type MembershipStatus } from '@/types/people';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { Badge, TableWrap, Td, Th, download } from './peopleShared';
import { useSections } from './useSections';

const PAGE_SIZE = 25;

const cleanParams = (filters: DirectoryFilters) =>
  Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined && value !== '')) as Record<string, string>;

export const MemberDirectoryPage = () => {
  const permissions = useAuthStore((s) => s.user?.permissions);
  const allowed = can(permissions, 'member:view');
  const [filters, setFilters] = useState<DirectoryFilters>({ archived: 'exclude', sort: 'name' });
  const [page, setPage] = useState(1);
  const sections = useSections(allowed);

  const update = (patch: Partial<DirectoryFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };
  const onSearch = useCallback((q: string) => {
    setFilters((prev) => (prev.q === (q || undefined) ? prev : { ...prev, q: q || undefined }));
    setPage(1);
  }, []);

  const list = useQuery({
    queryKey: ['members', 'directory', filters, page],
    enabled: allowed,
    queryFn: async () => (await apiClient.get<DirectoryPage>('/api/v2/members/search', { params: { ...cleanParams(filters), page, pageSize: PAGE_SIZE } })).data,
  });

  const exporter = useMutation({
    mutationFn: async () => {
      const response = await apiClient.get<Blob>('/api/v2/members/export', { params: cleanParams(filters), responseType: 'blob' });
      download(response.data, `members-${new Date().toISOString().slice(0, 10)}.csv`);
    },
  });

  return (
    <MainLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <AdminHeader
          title="Member directory"
          subtitle="Search everyone in your church by name, number, email or phone."
          action={
            <div className="flex flex-wrap gap-2">
              {can(permissions, 'member:export') && (
                <button type="button" className={`${secondaryBtn} inline-flex items-center gap-2`} disabled={exporter.isPending} onClick={() => exporter.mutate()}>
                  <Download className="h-4 w-4" /> {exporter.isPending ? 'Exporting…' : 'Export CSV'}
                </button>
              )}
              {can(permissions, 'member:import') && (
                <Link to="/members/import" className={`${secondaryBtn} inline-flex items-center gap-2`}>
                  <Upload className="h-4 w-4" /> Import
                </Link>
              )}
            </div>
          }
        />
        {!allowed ? (
          <NoAccess permission="member:view" />
        ) : (
          <>
            {exporter.isError && <ErrorNotice message={getApiErrorMessage(exporter.error, 'The export failed.')} />}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <SearchInput onSearch={onSearch} placeholder="Search members" className="sm:col-span-2" />
              <FormSelect
                label="Status"
                value={filters.status ?? ''}
                placeholder="All statuses"
                options={(['ACTIVE', 'INACTIVE', 'TRANSFERRED', 'DECEASED'] as MembershipStatus[]).map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))}
                onChange={(e) => update({ status: (e.target.value || undefined) as MembershipStatus | undefined })}
              />
              <FormSelect
                label="Section"
                value={filters.sectionId ?? ''}
                placeholder="All sections"
                options={(sections.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
                onChange={(e) => update({ sectionId: e.target.value || undefined })}
              />
              <FormSelect
                label="Archived"
                value={filters.archived}
                options={[{ value: 'exclude', label: 'Hide archived' }, { value: 'include', label: 'Include archived' }, { value: 'only', label: 'Only archived' }]}
                onChange={(e) => update({ archived: e.target.value as ArchiveFilter })}
              />
            </div>

            {list.isLoading ? (
              <LoadingBlock label="Loading members…" />
            ) : list.isError ? (
              <ErrorBlock error={list.error} onRetry={() => void list.refetch()} />
            ) : list.data && list.data.items.length === 0 ? (
              <EmptyBlock message="No members match these filters." />
            ) : (
              list.data && (
                <>
                  <p className="text-sm text-gray-500" role="status">
                    {list.data.total} member{list.data.total === 1 ? '' : 's'}
                  </p>
                  <TableWrap label="Members">
                    <thead className="bg-gray-50">
                      <tr><Th>Name</Th><Th>Number</Th><Th>Contact</Th><Th>Section</Th><Th>Status</Th><Th>Joined</Th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {list.data.items.map((m) => (
                        <tr key={m.id} className={m.archivedAt ? 'bg-gray-50 text-gray-500' : ''}>
                          <Td>
                            <Link to={`/members/${m.id}`} className="font-medium text-primary-700 hover:underline">{fullName(m)}</Link>
                            {m.archivedAt && <span className="ml-2"><Badge value="INACTIVE" label="Archived" /></span>}
                          </Td>
                          <Td>{m.membershipNumber}</Td>
                          <Td>{m.email ?? m.phone ?? '—'}</Td>
                          <Td>{m.sectionName ?? '—'}</Td>
                          <Td><Badge value={m.membershipStatus} /></Td>
                          <Td>{formatDate(m.joinDate)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </TableWrap>
                  <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPage={setPage} />
                </>
              )
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
};
