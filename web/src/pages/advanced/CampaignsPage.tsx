import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/Layout/MainLayout';
import { EmptyBlock, ErrorBlock, LoadingBlock, card, formatDate, formatMoney, primaryBtn, titleCase } from '@/pages/account/shared';
import { AdminHeader, NoAccess } from '@/pages/admin/adminShared';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { useAuthStore } from '@stores/authStore';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import { can } from '@/types/notifications';
import type { CampaignList } from '@/types/advanced';
import { Labeled, ProgressBar, inputCls } from './shared';

export const CAMPAIGN_PERMISSION = 'campaign:manage';
const KEY = ['campaigns'] as const;

const CreateForm = ({ onDone }: { onDone: () => void }) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', description: '', goalAmount: '', startDate: new Date().toISOString().slice(0, 10), endDate: '', isPublic: false });
  const [error, setError] = useState('');
  const create = useMutation({
    mutationFn: async () => apiClient.post('/api/v2/campaigns', {
      name: form.name.trim(), goalAmount: Number(form.goalAmount), startDate: form.startDate, isPublic: form.isPublic,
      ...(form.description.trim() ? { description: form.description.trim() } : {}), ...(form.endDate ? { endDate: form.endDate } : {}),
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: KEY }); onDone(); },
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.name.trim().length < 3) return setError('Give the campaign a name of at least 3 characters.');
    if (!(Number(form.goalAmount) > 0)) return setError('Enter a goal amount above zero.');
    setError('');
    create.mutate();
  };
  return (
    <form onSubmit={submit} className={`${card} space-y-3`} aria-label="New campaign">
      <Labeled label="Name"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Labeled>
      <Labeled label="Description"><textarea className={inputCls} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Labeled>
      <div className="grid gap-3 sm:grid-cols-3">
        <Labeled label="Goal amount"><input className={inputCls} type="number" min="0" step="0.01" value={form.goalAmount} onChange={(e) => setForm({ ...form, goalAmount: e.target.value })} /></Labeled>
        <Labeled label="Start date"><input className={inputCls} type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Labeled>
        <Labeled label="End date (optional)"><input className={inputCls} type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Labeled>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isPublic} onChange={(e) => setForm({ ...form, isPublic: e.target.checked })} /> Show a public progress page once active</label>
      {(error || create.error != null) && <ErrorNotice message={error || getApiErrorMessage(create.error)} />}
      <button type="submit" className={primaryBtn} disabled={create.isPending}>Create campaign</button>
    </form>
  );
};

export const CampaignsPage = () => {
  const allowed = can(useAuthStore((s) => s.user?.permissions), CAMPAIGN_PERMISSION);
  const [creating, setCreating] = useState(false);
  const list = useQuery({ queryKey: KEY, enabled: allowed, queryFn: async () => (await apiClient.get<CampaignList>('/api/v2/campaigns', { params: { take: 100 } })).data });
  return (
    <MainLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <AdminHeader title="Fundraising campaigns" subtitle="Each campaign has its own fund; progress is the completed gifts into it."
          action={allowed ? <button type="button" className={primaryBtn} onClick={() => setCreating((v) => !v)}>{creating ? 'Close form' : 'New campaign'}</button> : undefined} />
        {!allowed && <NoAccess permission={CAMPAIGN_PERMISSION} />}
        {allowed && creating && <CreateForm onDone={() => setCreating(false)} />}
        {allowed && list.isLoading && <LoadingBlock />}
        {list.isError && <ErrorBlock error={list.error} onRetry={() => list.refetch()} />}
        {list.data && list.data.items.length === 0 && <EmptyBlock message="No campaigns yet." />}
        {list.data && (
          <ul className="space-y-3">
            {list.data.items.map((c) => (
              <li key={c.id} className={card}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link to={`/campaigns/${c.id}`} className="text-lg font-semibold text-primary-700 hover:underline">{c.name}</Link>
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700">{titleCase(c.status)}</span>
                </div>
                <div className="mt-3"><ProgressBar percent={c.percent} label={`${c.name} progress`} /></div>
                <p className="mt-2 text-sm text-gray-600">{formatMoney(c.raised, 'USD')} of {formatMoney(c.goalAmount, 'USD')} ({c.percent}%) · {c.donors} donor(s) · from {formatDate(c.startDate)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </MainLayout>
  );
};
export default CampaignsPage;
