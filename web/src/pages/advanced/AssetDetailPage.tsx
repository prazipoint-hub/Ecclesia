import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { MainLayout } from '@/components/Layout/MainLayout';
import { EmptyBlock, ErrorBlock, LoadingBlock, card, formatDate, formatMoney, primaryBtn, secondaryBtn, titleCase } from '@/pages/account/shared';
import { AdminHeader, NoAccess } from '@/pages/admin/adminShared';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { useAuthStore } from '@stores/authStore';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import { can } from '@/types/notifications';
import type { AssetDetail } from '@/types/advanced';
import { ConfirmModal, Labeled, inputCls } from './shared';

export const AssetDetailPage = () => {
  const { id = '' } = useParams();
  const permissions = useAuthStore((s) => s.user?.permissions);
  const allowed = can(permissions, 'asset:view');
  const canManage = can(permissions, 'asset:manage');
  const queryClient = useQueryClient();
  const [retiring, setRetiring] = useState(false);
  const [form, setForm] = useState({ performedOn: new Date().toISOString().slice(0, 10), description: '', cost: '', nextDueDate: '' });
  const asset = useQuery({ queryKey: ['assets', id], enabled: allowed, queryFn: async () => (await apiClient.get<AssetDetail>(`/api/v2/assets/${id}`)).data });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['assets'] });
  const retire = useMutation({ mutationFn: async () => apiClient.post(`/api/v2/assets/${id}/retire`), onSuccess: () => { setRetiring(false); refresh(); } });
  const setStatus = useMutation({ mutationFn: async (status: 'ACTIVE' | 'IN_REPAIR') => apiClient.put(`/api/v2/assets/${id}`, { status }), onSuccess: refresh });
  const record = useMutation({
    mutationFn: async () => apiClient.post(`/api/v2/assets/${id}/maintenance`, {
      performedOn: form.performedOn, description: form.description.trim(), ...(form.cost ? { cost: Number(form.cost) } : {}), ...(form.nextDueDate ? { nextDueDate: form.nextDueDate } : {}),
    }),
    onSuccess: () => { setForm({ ...form, description: '', cost: '', nextDueDate: '' }); refresh(); },
  });
  const a = asset.data;
  const inService = a && a.status !== 'RETIRED';
  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <Link to="/assets" className="text-sm font-medium text-primary-600">← Assets</Link>
        <AdminHeader title={a ? `${a.tag} · ${a.name}` : 'Asset'} />
        {!allowed && <NoAccess permission="asset:view" />}
        {allowed && asset.isLoading && <LoadingBlock />}
        {asset.isError && <ErrorBlock error={asset.error} onRetry={() => asset.refetch()} />}
        {a && (
          <>
            <section className={`${card} space-y-1 text-sm text-gray-700`}>
              <p>Category: {a.category.name} · Status: <strong>{titleCase(a.status)}</strong></p>
              <p>Location: {a.location ?? '—'} · Serial: {a.serialNumber ?? '—'}</p>
              <p>Purchased: {formatDate(a.purchaseDate)}{a.purchaseCost !== null ? ` for ${formatMoney(a.purchaseCost, 'USD')}` : ''}</p>
              {a.retiredAt && <p>Retired {formatDate(a.retiredAt)}</p>}
              {canManage && inService && (
                <div className="flex gap-2 pt-2">
                  {a.status === 'ACTIVE' ? <button type="button" className={secondaryBtn} onClick={() => setStatus.mutate('IN_REPAIR')}>Mark in repair</button> : <button type="button" className={secondaryBtn} onClick={() => setStatus.mutate('ACTIVE')}>Mark active</button>}
                  <button type="button" className={secondaryBtn} onClick={() => { retire.reset(); setRetiring(true); }}>Retire asset</button>
                </div>
              )}
              {setStatus.error != null && <ErrorNotice message={getApiErrorMessage(setStatus.error)} />}
            </section>
            {canManage && inService && (
              <form className={`${card} space-y-3`} aria-label="Record maintenance" onSubmit={(e) => { e.preventDefault(); if (form.description.trim().length >= 3) record.mutate(); }}>
                <h2 className="text-lg font-medium">Record maintenance</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Labeled label="Date of work"><input className={inputCls} type="date" value={form.performedOn} onChange={(e) => setForm({ ...form, performedOn: e.target.value })} /></Labeled>
                  <Labeled label="Cost"><input className={inputCls} type="number" min="0" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></Labeled>
                  <Labeled label="What was done"><input className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Labeled>
                  <Labeled label="Next due (optional)"><input className={inputCls} type="date" value={form.nextDueDate} onChange={(e) => setForm({ ...form, nextDueDate: e.target.value })} /></Labeled>
                </div>
                {record.error != null && <ErrorNotice message={getApiErrorMessage(record.error)} />}
                <button type="submit" className={primaryBtn} disabled={record.isPending}>Save</button>
              </form>
            )}
            <section className={card}>
              <h2 className="text-lg font-medium">Maintenance history</h2>
              {a.maintenance.length === 0 ? <EmptyBlock message="No maintenance recorded." /> : (
                <ul className="mt-2 divide-y divide-gray-100 text-sm">
                  {a.maintenance.map((m) => <li key={m.id} className="py-2">{formatDate(m.performedOn)} — {m.description}{m.cost !== null ? ` (${formatMoney(m.cost, 'USD')})` : ''}{m.nextDueDate ? ` · next due ${formatDate(m.nextDueDate)}` : ''}</li>)}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
      <ConfirmModal open={retiring} title="Retire this asset" message="A retired asset is kept for the record but can no longer be edited or serviced. This cannot be undone." confirmLabel="Yes, retire"
        pending={retire.isPending} error={retire.error} onConfirm={() => retire.mutate()} onClose={() => setRetiring(false)} />
    </MainLayout>
  );
};
export default AssetDetailPage;
