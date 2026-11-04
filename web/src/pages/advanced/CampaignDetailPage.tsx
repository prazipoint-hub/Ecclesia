import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { MainLayout } from '@/components/Layout/MainLayout';
import { ErrorBlock, LoadingBlock, card, formatDate, formatMoney, primaryBtn, secondaryBtn, titleCase } from '@/pages/account/shared';
import { AdminHeader, NoAccess } from '@/pages/admin/adminShared';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { useAuthStore } from '@stores/authStore';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import { can } from '@/types/notifications';
import type { Campaign } from '@/types/advanced';
import { CAMPAIGN_PERMISSION } from './CampaignsPage';
import { ConfirmModal, Labeled, ProgressBar, inputCls } from './shared';

const EditForm = ({ campaign }: { campaign: Campaign }) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: campaign.name, description: campaign.description ?? '', goalAmount: String(campaign.goalAmount), endDate: campaign.endDate?.slice(0, 10) ?? '', isPublic: campaign.isPublic });
  const save = useMutation({
    mutationFn: async () => apiClient.put(`/api/v2/campaigns/${campaign.id}`, {
      name: form.name.trim(), description: form.description.trim() || null, goalAmount: Number(form.goalAmount), endDate: form.endDate || null, isPublic: form.isPublic,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className={`${card} space-y-3`} aria-label="Edit campaign">
      <Labeled label="Name"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Labeled>
      <Labeled label="Description"><textarea className={inputCls} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Labeled>
      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="Goal amount"><input className={inputCls} type="number" min="0" step="0.01" value={form.goalAmount} onChange={(e) => setForm({ ...form, goalAmount: e.target.value })} /></Labeled>
        <Labeled label="End date"><input className={inputCls} type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Labeled>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isPublic} onChange={(e) => setForm({ ...form, isPublic: e.target.checked })} /> Public progress page</label>
      {save.error != null && <ErrorNotice message={getApiErrorMessage(save.error)} />}
      <button type="submit" className={primaryBtn} disabled={save.isPending}>Save changes</button>
    </form>
  );
};

export const CampaignDetailPage = () => {
  const { id = '' } = useParams();
  const allowed = can(useAuthStore((s) => s.user?.permissions), CAMPAIGN_PERMISSION);
  const queryClient = useQueryClient();
  const [confirmClose, setConfirmClose] = useState(false);
  const campaign = useQuery({ queryKey: ['campaigns', id], enabled: allowed, queryFn: async () => (await apiClient.get<Campaign>(`/api/v2/campaigns/${id}`)).data });
  const change = useMutation({
    mutationFn: async (action: 'activate' | 'close') => (await apiClient.post<Campaign>(`/api/v2/campaigns/${id}/${action}`)).data,
    onSuccess: () => { setConfirmClose(false); queryClient.invalidateQueries({ queryKey: ['campaigns'] }); },
  });
  const c = campaign.data;
  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <Link to="/campaigns" className="text-sm font-medium text-primary-600">← Campaigns</Link>
        <AdminHeader title={c?.name ?? 'Campaign'} />
        {!allowed && <NoAccess permission={CAMPAIGN_PERMISSION} />}
        {allowed && campaign.isLoading && <LoadingBlock />}
        {campaign.isError && <ErrorBlock error={campaign.error} onRetry={() => campaign.refetch()} />}
        {c && (
          <>
            <section className={`${card} space-y-3`}>
              <p className="text-sm text-gray-600">Status: <strong>{titleCase(c.status)}</strong> · Started {formatDate(c.startDate)}{c.endDate ? ` · Ends ${formatDate(c.endDate)}` : ''}</p>
              <ProgressBar percent={c.percent} label="Campaign progress" />
              <p className="text-sm text-gray-700">{formatMoney(c.raised, 'USD')} raised of {formatMoney(c.goalAmount, 'USD')} ({c.percent}%) · {c.gifts} gift(s) from {c.donors} donor(s)</p>
              {c.isPublic && c.status === 'ACTIVE' && <p className="text-sm">Public page: <Link className="font-medium text-primary-700 underline" to={`/campaign/${c.slug}`}>{`${window.location.origin}/campaign/${c.slug}`}</Link></p>}
              {c.isPublic && c.status !== 'ACTIVE' && <p className="text-xs text-gray-500">The public page appears once the campaign is active.</p>}
              <div className="flex gap-2">
                {c.status === 'DRAFT' && <button type="button" className={primaryBtn} disabled={change.isPending} onClick={() => change.mutate('activate')}>Activate</button>}
                {c.status === 'ACTIVE' && <button type="button" className={secondaryBtn} onClick={() => { change.reset(); setConfirmClose(true); }}>Close campaign</button>}
              </div>
              {change.error != null && !confirmClose && <ErrorNotice message={getApiErrorMessage(change.error)} />}
            </section>
            {c.status !== 'CLOSED' ? <EditForm key={c.id + c.name} campaign={c} /> : <p className="text-sm text-gray-500">A closed campaign can no longer be changed.</p>}
          </>
        )}
      </div>
      <ConfirmModal open={confirmClose} title="Close this campaign" message="Closing stops new gifts to this campaign. Gifts already made stay in the books. This cannot be undone." confirmLabel="Yes, close campaign"
        pending={change.isPending} error={change.error} onConfirm={() => change.mutate('close')} onClose={() => setConfirmClose(false)} />
    </MainLayout>
  );
};
export default CampaignDetailPage;
