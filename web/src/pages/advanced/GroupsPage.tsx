import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/Layout/MainLayout';
import { EmptyBlock, ErrorBlock, LoadingBlock, card, primaryBtn, titleCase } from '@/pages/account/shared';
import { AdminHeader, NoAccess } from '@/pages/admin/adminShared';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { useAuthStore } from '@stores/authStore';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import { can } from '@/types/notifications';
import type { GroupSummary } from '@/types/advanced';
import { Labeled, inputCls } from './shared';

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

export const GroupsPage = () => {
  const permissions = useAuthStore((s) => s.user?.permissions);
  const allowed = can(permissions, 'group:view');
  const canManage = can(permissions, 'group:manage');
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', meetingDay: '', meetingTime: '', location: '', capacity: '' });
  const list = useQuery({ queryKey: ['groups'], enabled: allowed, queryFn: async () => (await apiClient.get<{ items: GroupSummary[]; total: number }>('/api/v2/groups', { params: { take: 100 } })).data });
  const create = useMutation({
    mutationFn: async () => apiClient.post('/api/v2/groups', {
      name: form.name.trim(), ...(form.meetingDay ? { meetingDay: form.meetingDay } : {}), ...(form.meetingTime ? { meetingTime: form.meetingTime } : {}),
      ...(form.location.trim() ? { location: form.location.trim() } : {}), ...(form.capacity ? { capacity: Number(form.capacity) } : {}),
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['groups'] }); setCreating(false); setForm({ name: '', meetingDay: '', meetingTime: '', location: '', capacity: '' }); },
  });
  return (
    <MainLayout>
      <div className="mx-auto max-w-6xl space-y-7">
        <AdminHeader title="Small groups" subtitle="Cell groups, Bible study groups and other regular gatherings."
          action={canManage ? <button type="button" className={primaryBtn} onClick={() => setCreating((v) => !v)}>{creating ? 'Close form' : 'New group'}</button> : undefined} />
        {!allowed && <NoAccess permission="group:view" />}
        {canManage && creating && (
          <form className={`${card} space-y-3`} aria-label="New group" onSubmit={(e) => { e.preventDefault(); if (form.name.trim().length >= 2) create.mutate(); }}>
            <Labeled label="Name"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Labeled>
            <div className="grid gap-3 sm:grid-cols-4">
              <Labeled label="Meeting day"><select className={inputCls} value={form.meetingDay} onChange={(e) => setForm({ ...form, meetingDay: e.target.value })}><option value="">—</option>{DAYS.map((d) => <option key={d} value={d}>{titleCase(d)}</option>)}</select></Labeled>
              <Labeled label="Time"><input className={inputCls} type="time" value={form.meetingTime} onChange={(e) => setForm({ ...form, meetingTime: e.target.value })} /></Labeled>
              <Labeled label="Location"><input className={inputCls} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Labeled>
              <Labeled label="Capacity"><input className={inputCls} type="number" min="2" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></Labeled>
            </div>
            {create.error != null && <ErrorNotice message={getApiErrorMessage(create.error)} />}
            <button type="submit" className={primaryBtn} disabled={create.isPending}>Create group</button>
          </form>
        )}
        {allowed && list.isLoading && <LoadingBlock />}
        {list.isError && <ErrorBlock error={list.error} onRetry={() => list.refetch()} />}
        {list.data && list.data.items.length === 0 && <EmptyBlock message="No groups yet." />}
        {list.data && (
          <ul className="grid gap-3 sm:grid-cols-2">
            {list.data.items.map((g) => (
              <li key={g.id} className={card}>
                <Link to={`/groups/${g.id}`} className="text-lg font-semibold text-primary-700 hover:underline">{g.name}</Link>
                <p className="mt-1 text-sm text-gray-600">{g.meetingDay ? `${titleCase(g.meetingDay)}${g.meetingTime ? ` ${g.meetingTime}` : ''}` : 'No fixed meeting time'}{g.location ? ` · ${g.location}` : ''}</p>
                <p className="text-sm text-gray-600">{g.memberCount}{g.capacity ? ` / ${g.capacity}` : ''} members · {titleCase(g.status)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </MainLayout>
  );
};
export default GroupsPage;
