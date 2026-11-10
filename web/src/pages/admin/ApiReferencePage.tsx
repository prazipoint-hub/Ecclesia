import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { FormSelect } from '@/components/forms/FormSelect';
import { ErrorBlock, LoadingBlock, card } from '@/pages/account/shared';
import { useAuthStore } from '@stores/authStore';
import { apiClient } from '@/utils/api';
import { can } from '@/types/notifications';
import type { EndpointInfo } from '@/types/admin';
import { AdminHeader, NoAccess } from './adminShared';

const PERMISSION = 'admin:api:view';

export const ApiReferencePage = () => {
  const allowed = can(useAuthStore((s) => s.user?.permissions), PERMISSION);
  const [q, setQ] = useState('');
  const [method, setMethod] = useState('');
  const endpoints = useQuery({ queryKey: ['admin', 'api-reference'], enabled: allowed, queryFn: async () => (await apiClient.get<EndpointInfo[]>('/api/v2/admin/api-reference')).data });
  const rows = useMemo(() => (endpoints.data ?? []).filter((e) => (!method || e.method === method) && (!q || `${e.path} ${e.permission ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [endpoints.data, q, method]);
  return (
    <MainLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <AdminHeader title="API reference" subtitle="Generated from the live route tables. Rules checked inside the service (ownership, business rules) are not listed." action={<a href="/api/docs.json" target="_blank" rel="noreferrer" className="text-sm font-medium text-primary-600 hover:underline">OpenAPI JSON</a>} />
        {!allowed && <NoAccess permission={PERMISSION} />}
        {allowed && (
          <div className="flex flex-wrap gap-3">
            <FormField className="flex-1" label="Search path or permission" value={q} onChange={(e) => setQ(e.target.value)} />
            <FormSelect label="Method" value={method} onChange={(e) => setMethod(e.target.value)} options={[{ value: '', label: 'All' }, ...['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => ({ value: m, label: m }))]} />
          </div>
        )}
        {allowed && endpoints.isLoading && <LoadingBlock />}
        {endpoints.isError && <ErrorBlock error={endpoints.error} onRetry={() => endpoints.refetch()} />}
        {endpoints.data && (
          <div className={`${card} overflow-x-auto p-0`}>
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="p-3">Method</th><th className="p-3">Path</th><th className="p-3">Sign-in</th><th className="p-3">Permission</th></tr></thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={`${e.method} ${e.path}`} className="border-t border-gray-100">
                    <td className="p-3 font-mono text-xs font-medium">{e.method}</td>
                    <td className="p-3 font-mono text-xs">{e.path}</td>
                    <td className="p-3">{e.authenticated ? 'Required' : 'Public'}</td>
                    <td className="p-3">{e.permission ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="p-3 text-xs text-gray-500">{rows.length} of {endpoints.data.length} endpoints</p>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default ApiReferencePage;
