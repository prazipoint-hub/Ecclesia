import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { EmptyBlock, ErrorBlock, LoadingBlock, card, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { useAuthStore } from '@stores/authStore';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import { can } from '@/types/notifications';
import type { AuditList } from '@/types/admin';
import { AdminHeader, NoAccess } from './adminShared';

const PERMISSION = 'admin:audit:view';
const PAGE = 50;

export const AuditLogPage = () => {
  const allowed = can(useAuthStore((s) => s.user?.permissions), PERMISSION);
  const [filters, setFilters] = useState({ action: '', entityType: '', actorId: '', from: '', to: '' });
  const [page, setPage] = useState(0);
  const [exportError, setExportError] = useState<string>();

  const params = () => Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
  const log = useQuery({
    queryKey: ['admin', 'audit', filters, page],
    enabled: allowed,
    queryFn: async () => (await apiClient.get<AuditList>('/api/v2/admin/audit-logs', { params: { ...params(), skip: page * PAGE, take: PAGE } })).data,
  });
  const set = (key: keyof typeof filters) => (e: React.ChangeEvent<HTMLInputElement>) => { setPage(0); setFilters({ ...filters, [key]: e.target.value }); };

  const exportCsv = async () => {
    if (!filters.from || !filters.to) return setExportError('Choose a start and end date before exporting.');
    setExportError(undefined);
    try {
      const res = await apiClient.get<Blob>('/api/v2/admin/audit-logs/export', { params: params(), responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-log-${filters.from}-to-${filters.to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(getApiErrorMessage(error));
    }
  };

  const total = log.data?.total ?? 0;
  return (
    <MainLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <AdminHeader title="Audit log" subtitle="Who did what, and when. Exporting is itself recorded." action={allowed && <button type="button" className={secondaryBtn} onClick={exportCsv}>Export CSV</button>} />
        {!allowed && <NoAccess permission={PERMISSION} />}
        {allowed && (
          <div className="grid gap-3 sm:grid-cols-5">
            <FormField label="Action" value={filters.action} onChange={set('action')} />
            <FormField label="Entity type" value={filters.entityType} onChange={set('entityType')} />
            <FormField label="Actor ID" value={filters.actorId} onChange={set('actorId')} />
            <FormField label="From" type="date" value={filters.from} onChange={set('from')} />
            <FormField label="To" type="date" value={filters.to} onChange={set('to')} />
          </div>
        )}
        {exportError && <ErrorNotice message={exportError} />}
        {allowed && log.isLoading && <LoadingBlock />}
        {log.isError && <ErrorBlock error={log.error} onRetry={() => log.refetch()} />}
        {log.data && log.data.items.length === 0 && <EmptyBlock message="No entries match." />}
        {log.data && log.data.items.length > 0 && (
          <div className={`${card} overflow-x-auto p-0`}>
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="p-3">When</th><th className="p-3">Action</th><th className="p-3">Entity</th><th className="p-3">By</th><th className="p-3">Details</th></tr></thead>
              <tbody>
                {log.data.items.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100 align-top">
                    <td className="whitespace-nowrap p-3">{new Date(r.timestamp).toLocaleString()}</td>
                    <td className="p-3 font-medium">{r.action}</td>
                    <td className="p-3">{r.entityType}<br /><span className="text-xs text-gray-500">{r.entityId}</span></td>
                    <td className="p-3">{r.actorName ?? r.actorId}</td>
                    <td className="max-w-xs break-words p-3 text-xs text-gray-600">{r.changes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > PAGE && (
          <div className="flex items-center justify-between text-sm">
            <button type="button" className={secondaryBtn} disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
            <span>Page {page + 1} of {Math.ceil(total / PAGE)}</span>
            <button type="button" className={primaryBtn} disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default AuditLogPage;
