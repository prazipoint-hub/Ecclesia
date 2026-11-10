import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { FormSelect } from '@/components/forms/FormSelect';
import { EmptyBlock, ErrorBlock, LoadingBlock, card, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { AdminHeader, NoAccess } from '@/pages/admin/adminShared';
import { apiClient } from '@/utils/api';
import type { JournalList, SyncResult } from '@/types/accounting';
import { ApiError, FinanceNav, money, num, statusBadge, td, th, toDateInput, usePermissions } from './financeShared';

const SyncPanel = () => {
  const queryClient = useQueryClient();
  const [result, setResult] = useState<SyncResult | null>(null);
  const run = useMutation({
    mutationFn: (preview: boolean) => apiClient.post<SyncResult>('/api/v2/accounting/sync', { preview }),
    onSuccess: (res) => {
      setResult(res.data);
      if (!res.data.preview) {
        void queryClient.invalidateQueries({ queryKey: ['accounting'] });
      }
    },
  });
  const pending = result?.preview ? result.receipts + result.expenditures + result.reversed : 0;
  return (
    <section className={card} aria-label="Sync receipts and expenditures">
      <h2 className="text-lg font-medium text-gray-900">Sync receipts and expenditures</h2>
      <p className="mt-1 text-sm text-gray-600">Post journal entries for receipts and paid expenditures not yet in the ledger. Safe to repeat.</p>
      {run.error && <ApiError error={run.error} />}
      {result && (
        <p role="status" className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-800">
          {result.preview ? 'Would post' : 'Posted'}: {result.receipts} receipts, {result.expenditures} expenditures, {result.reversed} reversals (total {money(result.total)}).
          {result.blockedByClosedPeriod > 0 && <span className="block text-amber-700">{result.blockedByClosedPeriod} blocked by a closed period.</span>}
          {result.failed > 0 && <span className="block text-red-700">{result.failed} failed.</span>}
          {result.remaining > 0 && <span className="block">{result.remaining} more remain; run again.</span>}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button type="button" className={secondaryBtn} disabled={run.isPending} onClick={() => run.mutate(true)}>Preview</button>
        <button type="button" className={primaryBtn} disabled={run.isPending || !result?.preview || pending === 0} onClick={() => run.mutate(false)}>Confirm sync</button>
      </div>
    </section>
  );
};

export const JournalsPage = () => {
  const has = usePermissions();
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const journals = useQuery({
    queryKey: ['accounting', 'journals', status, source, q, page],
    queryFn: async () => (await apiClient.get<JournalList>('/api/v2/accounting/journals', { params: { page, pageSize: 25, ...(status && { status }), ...(source && { source }), ...(q && { q }) } })).data,
  });
  const pages = journals.data ? Math.max(1, Math.ceil(journals.data.total / journals.data.pageSize)) : 1;

  return (
    <MainLayout>
      <div className="space-y-6">
        <AdminHeader title="Journal entries" subtitle="Every change to the ledger, posted or pending." action={has('finance:journal:create') && <Link to="/finance/journals/new" className={primaryBtn}>New entry</Link>} />
        <FinanceNav />
        {!has('finance:view') ? <NoAccess permission="finance:view" /> : (
          <>
            {has('finance:journal:approve') && <SyncPanel />}
            <div className="grid gap-3 sm:grid-cols-3">
              <FormSelect label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="All" options={['DRAFT', 'POSTED', 'REVERSED'].map((v) => ({ value: v, label: v[0] + v.slice(1).toLowerCase() }))} />
              <FormSelect label="Source" value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }} placeholder="All" options={['MANUAL', 'RECEIPT', 'EXPENDITURE', 'OPENING', 'REVERSAL'].map((v) => ({ value: v, label: v[0] + v.slice(1).toLowerCase() }))} />
              <FormField label="Search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Reference or description" />
            </div>
            {journals.isLoading ? <LoadingBlock /> : journals.error ? <ErrorBlock error={journals.error} onRetry={() => void journals.refetch()} /> : journals.data && journals.data.items.length === 0 ? <EmptyBlock message="No journal entries match." /> : (
              <div className={card}>
                <table className="min-w-full divide-y divide-gray-200">
                  <thead><tr><th className={th}>Reference</th><th className={th}>Date</th><th className={th}>Description</th><th className={th}>Source</th><th className={th}>Status</th><th className={`${th} text-right`}>Total</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {journals.data?.items.map((j) => (
                      <tr key={j.id}>
                        <td className={td}><Link className="font-medium text-primary-600 hover:underline" to={`/finance/journals/${j.id}`}>{j.reference}</Link></td>
                        <td className={td}>{toDateInput(j.postDate)}</td><td className={td}>{j.description}</td><td className={td}>{j.source}</td>
                        <td className={td}><span className={statusBadge(j.status)}>{j.status}</span></td><td className={num}>{money(j.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
                  <span>Page {page} of {pages}</span>
                  <div className="flex gap-2">
                    <button type="button" className={secondaryBtn} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
                    <button type="button" className={secondaryBtn} disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
};
