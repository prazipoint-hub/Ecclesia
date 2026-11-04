import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { FormTextarea } from '@/components/forms/FormTextarea';
import { Modal } from '@/components/forms/Modal';
import { EmptyBlock, ErrorBlock, LoadingBlock, card, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { AdminHeader, NoAccess } from '@/pages/admin/adminShared';
import { apiClient } from '@/utils/api';
import type { FinancialPeriod } from '@/types/accounting';
import { ApiError, FinanceNav, statusBadge, td, th, toDateInput, usePermissions } from './financeShared';

const KEY = ['accounting', 'periods'] as const;

export const PeriodsPage = () => {
  const has = usePermissions();
  const queryClient = useQueryClient();
  const periods = useQuery({ queryKey: KEY, queryFn: async () => (await apiClient.get<FinancialPeriod[]>('/api/v2/accounting/periods')).data });
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', startDate: '', endDate: '' });
  const [reopening, setReopening] = useState<FinancialPeriod | null>(null);
  const [reason, setReason] = useState('');
  const refresh = () => void queryClient.invalidateQueries({ queryKey: KEY });

  const create = useMutation({
    mutationFn: () => apiClient.post('/api/v2/accounting/periods', draft),
    onSuccess: () => { refresh(); setAdding(false); setDraft({ name: '', startDate: '', endDate: '' }); },
  });
  const close = useMutation({ mutationFn: (p: FinancialPeriod) => apiClient.post(`/api/v2/accounting/periods/${p.id}/close`), onSuccess: refresh });
  const reopen = useMutation({
    mutationFn: () => apiClient.post(`/api/v2/accounting/periods/${reopening!.id}/reopen`, { reason: reason.trim() }),
    onSuccess: () => { refresh(); setReopening(null); setReason(''); },
  });
  const canManage = has('finance:period:manage');

  return (
    <MainLayout>
      <div className="space-y-6">
        <AdminHeader title="Financial periods" subtitle="Closing a period blocks new postings inside it." action={canManage && <button type="button" className={primaryBtn} onClick={() => setAdding(true)}>Add period</button>} />
        <FinanceNav />
        {!has('finance:view') ? <NoAccess permission="finance:view" /> : periods.isLoading ? <LoadingBlock /> : periods.error ? (
          <ErrorBlock error={periods.error} onRetry={() => void periods.refetch()} />
        ) : periods.data && periods.data.length === 0 ? <EmptyBlock message="No periods defined." /> : (
          <div className={card}>
            {close.error && <ApiError error={close.error} />}
            <table className="min-w-full divide-y divide-gray-200">
              <thead><tr><th className={th}>Name</th><th className={th}>Start</th><th className={th}>End</th><th className={th}>Status</th><th className={th} /></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {periods.data?.map((p) => (
                  <tr key={p.id}>
                    <td className={td}>{p.name}</td><td className={td}>{toDateInput(p.startDate)}</td><td className={td}>{toDateInput(p.endDate)}</td>
                    <td className={td}><span className={statusBadge(p.status)}>{p.status === 'OPEN' ? 'Open' : 'Closed'}</span></td>
                    <td className={`${td} text-right`}>
                      {canManage && p.status === 'OPEN' && <button type="button" className="font-medium text-primary-600 hover:underline" disabled={close.isPending} onClick={() => close.mutate(p)} aria-label={`Close ${p.name}`}>Close</button>}
                      {canManage && p.status === 'CLOSED' && <button type="button" className="font-medium text-primary-600 hover:underline" onClick={() => setReopening(p)} aria-label={`Reopen ${p.name}`}>Reopen</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Modal open={adding} title="Add period" onClose={() => setAdding(false)}>
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); create.mutate(); }} className="space-y-3">
          {create.error && <ApiError error={create.error} />}
          <FormField label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
          <FormField type="date" label="Start date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} required />
          <FormField type="date" label="End date" value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} required />
          <div className="flex justify-end gap-2"><button type="button" className={secondaryBtn} onClick={() => setAdding(false)}>Cancel</button><button type="submit" className={primaryBtn} disabled={create.isPending}>Add period</button></div>
        </form>
      </Modal>
      <Modal open={reopening !== null} title={`Reopen ${reopening?.name ?? ''}`} onClose={() => setReopening(null)}
        footer={<><button type="button" className={secondaryBtn} onClick={() => setReopening(null)}>Cancel</button><button type="button" className={primaryBtn} disabled={!reason.trim() || reopen.isPending} onClick={() => reopen.mutate()}>Reopen period</button></>}>
        {reopen.error && <ApiError error={reopen.error} />}
        <FormTextarea label="Reason for reopening" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </MainLayout>
  );
};
