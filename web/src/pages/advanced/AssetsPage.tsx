import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/Layout/MainLayout';
import { EmptyBlock, ErrorBlock, LoadingBlock, card, formatDate, primaryBtn, secondaryBtn, titleCase } from '@/pages/account/shared';
import { AdminHeader, NoAccess } from '@/pages/admin/adminShared';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { useAuthStore } from '@stores/authStore';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import { can } from '@/types/notifications';
import type { AssetCategory, AssetRow, DueMaintenance } from '@/types/advanced';
import { Labeled, inputCls } from './shared';

const CreateAsset = ({ categories, onDone }: { categories: AssetCategory[]; onDone: () => void }) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ categoryId: categories[0]?.id ?? '', tag: '', name: '', location: '', purchaseCost: '' });
  const [newCategory, setNewCategory] = useState('');
  const addCategory = useMutation({
    mutationFn: async () => (await apiClient.post<AssetCategory>('/api/v2/assets/categories', { name: newCategory.trim() })).data,
    onSuccess: (c) => { setForm((f) => ({ ...f, categoryId: c.id })); setNewCategory(''); queryClient.invalidateQueries({ queryKey: ['asset-categories'] }); },
  });
  const create = useMutation({
    mutationFn: async () => apiClient.post('/api/v2/assets', {
      categoryId: form.categoryId, tag: form.tag.trim(), name: form.name.trim(), ...(form.location.trim() ? { location: form.location.trim() } : {}),
      ...(form.purchaseCost ? { purchaseCost: Number(form.purchaseCost) } : {}),
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['assets'] }); onDone(); },
  });
  return (
    <form className={`${card} space-y-3`} aria-label="New asset" onSubmit={(e) => { e.preventDefault(); if (form.categoryId && form.tag.trim() && form.name.trim()) create.mutate(); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="Category"><select className={inputCls} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}><option value="">Choose…</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Labeled>
        <div className="flex items-end gap-2">
          <Labeled label="Or add a category"><input className={inputCls} value={newCategory} onChange={(e) => setNewCategory(e.target.value)} /></Labeled>
          <button type="button" className={secondaryBtn} disabled={newCategory.trim().length < 2 || addCategory.isPending} onClick={() => addCategory.mutate()}>Add</button>
        </div>
        <Labeled label="Tag (unique label)"><input className={inputCls} value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} /></Labeled>
        <Labeled label="Name"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Labeled>
        <Labeled label="Location"><input className={inputCls} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Labeled>
        <Labeled label="Purchase cost"><input className={inputCls} type="number" min="0" step="0.01" value={form.purchaseCost} onChange={(e) => setForm({ ...form, purchaseCost: e.target.value })} /></Labeled>
      </div>
      {(create.error ?? addCategory.error) != null && <ErrorNotice message={getApiErrorMessage(create.error ?? addCategory.error)} />}
      <button type="submit" className={primaryBtn} disabled={create.isPending}>Create asset</button>
    </form>
  );
};

export const AssetsPage = () => {
  const permissions = useAuthStore((s) => s.user?.permissions);
  const allowed = can(permissions, 'asset:view');
  const canManage = can(permissions, 'asset:manage');
  const [creating, setCreating] = useState(false);
  const [filters, setFilters] = useState({ q: '', status: '', categoryId: '' });
  const categories = useQuery({ queryKey: ['asset-categories'], enabled: allowed, queryFn: async () => (await apiClient.get<AssetCategory[]>('/api/v2/assets/categories')).data });
  const due = useQuery({ queryKey: ['assets', 'due'], enabled: allowed, queryFn: async () => (await apiClient.get<DueMaintenance[]>('/api/v2/assets/maintenance/due', { params: { days: 30 } })).data });
  const list = useQuery({
    queryKey: ['assets', filters], enabled: allowed,
    queryFn: async () => (await apiClient.get<{ items: AssetRow[]; total: number }>('/api/v2/assets', { params: { take: 100, ...(filters.q ? { q: filters.q } : {}), ...(filters.status ? { status: filters.status } : {}), ...(filters.categoryId ? { categoryId: filters.categoryId } : {}) } })).data,
  });
  return (
    <MainLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <AdminHeader title="Assets" subtitle="Equipment and property, with maintenance history."
          action={canManage ? <button type="button" className={primaryBtn} onClick={() => setCreating((v) => !v)}>{creating ? 'Close form' : 'New asset'}</button> : undefined} />
        {!allowed && <NoAccess permission="asset:view" />}
        {canManage && creating && categories.data && <CreateAsset categories={categories.data} onDone={() => setCreating(false)} />}
        {due.data && due.data.length > 0 && (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4" aria-label="Maintenance due">
            <h2 className="font-semibold text-amber-900">Maintenance due in the next 30 days</h2>
            <ul className="mt-2 space-y-1 text-sm text-amber-900">
              {due.data.map((d) => <li key={`${d.assetId}-${d.dueDate}`}><Link className="underline" to={`/assets/${d.assetId}`}>{d.tag} · {d.name}</Link> — {d.overdue ? 'overdue since' : 'due'} {formatDate(d.dueDate)}</li>)}
            </ul>
          </section>
        )}
        {allowed && (
          <div className="flex flex-wrap gap-2">
            <input aria-label="Search assets" placeholder="Search name or tag" className={`${inputCls} max-w-xs`} value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
            <select aria-label="Filter by status" className={`${inputCls} max-w-[10rem]`} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">Any status</option><option value="ACTIVE">Active</option><option value="IN_REPAIR">In repair</option><option value="RETIRED">Retired</option>
            </select>
            <select aria-label="Filter by category" className={`${inputCls} max-w-[12rem]`} value={filters.categoryId} onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })}>
              <option value="">Any category</option>{categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        {allowed && list.isLoading && <LoadingBlock />}
        {list.isError && <ErrorBlock error={list.error} onRetry={() => list.refetch()} />}
        {list.data && list.data.items.length === 0 && <EmptyBlock message="No assets found." />}
        {list.data && list.data.items.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead><tr className="text-gray-500"><th className="py-2">Tag</th><th>Name</th><th>Category</th><th>Location</th><th>Status</th></tr></thead>
            <tbody>{list.data.items.map((a) => <tr key={a.id} className="border-t border-gray-100"><td className="py-2"><Link className="font-medium text-primary-700 hover:underline" to={`/assets/${a.id}`}>{a.tag}</Link></td><td>{a.name}</td><td>{a.category}</td><td>{a.location ?? '—'}</td><td>{titleCase(a.status)}</td></tr>)}</tbody>
          </table>
        )}
      </div>
    </MainLayout>
  );
};
export default AssetsPage;
