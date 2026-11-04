import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { Modal } from '@/components/forms/Modal';
import { EmptyBlock, ErrorBlock, LoadingBlock, card, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { AdminHeader, NoAccess } from '@/pages/admin/adminShared';
import { apiClient } from '@/utils/api';
import { FUNDS_KEY, useFunds } from './financeQueries';
import { ApiError, FinanceNav, money, num, statusBadge, td, th, usePermissions } from './financeShared';

export const FundsPage = () => {
  const has = usePermissions();
  const queryClient = useQueryClient();
  const funds = useFunds();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', description: '', isRestricted: false });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: FUNDS_KEY });
  const create = useMutation({
    mutationFn: () => apiClient.post('/api/v2/accounting/funds', { name: draft.name.trim(), isRestricted: draft.isRestricted, ...(draft.description.trim() && { description: draft.description.trim() }) }),
    onSuccess: () => { refresh(); setAdding(false); setDraft({ name: '', description: '', isRestricted: false }); },
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { isActive?: boolean; isRestricted?: boolean } }) => apiClient.put(`/api/v2/accounting/funds/${id}`, body),
    onSuccess: refresh,
  });
  const canManage = has('finance:fund:manage');

  return (
    <MainLayout>
      <div className="space-y-6">
        <AdminHeader title="Funds" subtitle="Restricted funds can only be spent on their stated purpose." action={canManage && <button type="button" className={primaryBtn} onClick={() => setAdding(true)}>Add fund</button>} />
        <FinanceNav />
        {!has('finance:view') ? <NoAccess permission="finance:view" /> : funds.isLoading ? <LoadingBlock /> : funds.error ? (
          <ErrorBlock error={funds.error} onRetry={() => void funds.refetch()} />
        ) : funds.data && funds.data.length === 0 ? <EmptyBlock message="No funds yet." /> : (
          <div className={card}>
            {update.error && <ApiError error={update.error} />}
            <table className="min-w-full divide-y divide-gray-200">
              <thead><tr><th className={th}>Fund</th><th className={th}>Type</th><th className={`${th} text-right`}>Received</th><th className={`${th} text-right`}>Spent</th><th className={`${th} text-right`}>Balance</th><th className={th}>Status</th><th className={th} /></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {funds.data?.map((f) => (
                  <tr key={f.id}>
                    <td className={td}>{f.name}{f.description && <span className="block text-xs text-gray-500">{f.description}</span>}</td>
                    <td className={td}>{f.isRestricted ? 'Restricted' : 'General'}</td>
                    <td className={num}>{money(f.totalReceived)}</td><td className={num}>{money(f.totalSpent)}</td><td className={num}>{money(f.balance)}</td>
                    <td className={td}><span className={statusBadge(f.isActive ? 'POSTED' : 'DRAFT')}>{f.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td className={`${td} text-right`}>
                      {canManage && <button type="button" className="font-medium text-primary-600 hover:underline" disabled={update.isPending} onClick={() => update.mutate({ id: f.id, body: { isActive: !f.isActive } })} aria-label={`${f.isActive ? 'Deactivate' : 'Activate'} ${f.name}`}>{f.isActive ? 'Deactivate' : 'Activate'}</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Modal open={adding} title="Add fund" onClose={() => setAdding(false)}>
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); if (draft.name.trim()) create.mutate(); }} className="space-y-3">
          {create.error && <ApiError error={create.error} />}
          <FormField label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
          <FormField label="Description (optional)" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={draft.isRestricted} onChange={(e) => setDraft({ ...draft, isRestricted: e.target.checked })} /> Restricted fund</label>
          <div className="flex justify-end gap-2"><button type="button" className={secondaryBtn} onClick={() => setAdding(false)}>Cancel</button><button type="submit" className={primaryBtn} disabled={create.isPending}>Add fund</button></div>
        </form>
      </Modal>
    </MainLayout>
  );
};
