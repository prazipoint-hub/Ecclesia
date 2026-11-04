import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { MainLayout } from '@/components/Layout/MainLayout';
import { EmptyBlock, ErrorBlock, LoadingBlock, card, formatDate, primaryBtn, secondaryBtn, titleCase } from '@/pages/account/shared';
import { AdminHeader, NoAccess } from '@/pages/admin/adminShared';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { useAuthStore } from '@stores/authStore';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import { can } from '@/types/notifications';
import type { AttendanceSummary, GroupDetail, GroupSessionRow } from '@/types/advanced';
import { ConfirmModal, Labeled, inputCls } from './shared';

const Members = ({ group, canManage }: { group: GroupDetail; canManage: boolean }) => {
  const queryClient = useQueryClient();
  const [memberId, setMemberId] = useState('');
  const [role, setRole] = useState<'MEMBER' | 'LEADER'>('MEMBER');
  const [removing, setRemoving] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['groups'] });
  const add = useMutation({ mutationFn: async () => apiClient.post(`/api/v2/groups/${group.id}/members`, { memberId: memberId.trim(), role }), onSuccess: () => { setMemberId(''); refresh(); } });
  const setMemberRole = useMutation({ mutationFn: async (v: { id: string; role: string }) => apiClient.put(`/api/v2/groups/${group.id}/members/${v.id}`, { role: v.role }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: async (id: string) => apiClient.delete(`/api/v2/groups/${group.id}/members/${id}`), onSuccess: () => { setRemoving(null); refresh(); } });
  return (
    <section className={`${card} space-y-3`}>
      <h2 className="text-lg font-semibold">Members ({group.members.length}{group.capacity ? ` of ${group.capacity}` : ''})</h2>
      {group.members.length === 0 ? <EmptyBlock message="No members yet." /> : (
        <ul className="divide-y divide-gray-100">
          {group.members.map((m) => (
            <li key={m.membershipId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>{m.name} <span className="text-gray-500">({m.membershipNumber})</span></span>
              {canManage ? (
                <span className="flex items-center gap-2">
                  <select aria-label={`Role of ${m.name}`} className="rounded border border-gray-300 px-2 py-1 text-sm" value={m.role} onChange={(e) => setMemberRole.mutate({ id: m.membershipId, role: e.target.value })}>
                    <option value="MEMBER">Member</option><option value="LEADER">Leader</option>
                  </select>
                  <button type="button" className={secondaryBtn} onClick={() => setRemoving(m.membershipId)}>Remove</button>
                </span>
              ) : <span>{titleCase(m.role)}</span>}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (memberId.trim()) add.mutate(); }}>
          <Labeled label="Member ID"><input className={inputCls} value={memberId} onChange={(e) => setMemberId(e.target.value)} /></Labeled>
          <Labeled label="Role"><select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as 'MEMBER' | 'LEADER')}><option value="MEMBER">Member</option><option value="LEADER">Leader</option></select></Labeled>
          <button type="submit" className={primaryBtn} disabled={add.isPending}>Add member</button>
        </form>
      )}
      {(add.error ?? setMemberRole.error) != null && <ErrorNotice message={getApiErrorMessage(add.error ?? setMemberRole.error)} />}
      <ConfirmModal open={removing !== null} title="Remove from group" message="They leave the group but past attendance stays on record." confirmLabel="Remove" pending={remove.isPending} error={remove.error}
        onConfirm={() => removing && remove.mutate(removing)} onClose={() => setRemoving(null)} />
    </section>
  );
};

const RecordSession = ({ group }: { group: GroupDetail }) => {
  const queryClient = useQueryClient();
  const [topic, setTopic] = useState('');
  const [lesson, setLesson] = useState('');
  const [heldOn, setHeldOn] = useState(new Date().toISOString().slice(0, 10));
  const [present, setPresent] = useState<Record<string, boolean>>({});
  const record = useMutation({
    mutationFn: async () => apiClient.post(`/api/v2/groups/${group.id}/sessions`, {
      heldOn, topic: topic.trim(), ...(lesson.trim() ? { lesson: lesson.trim() } : {}),
      attendance: group.members.map((m) => ({ membershipId: m.membershipId, present: Boolean(present[m.membershipId]) })),
    }),
    onSuccess: () => { setTopic(''); setLesson(''); setPresent({}); queryClient.invalidateQueries({ queryKey: ['groups'] }); },
  });
  return (
    <form className={`${card} space-y-3`} aria-label="Record session" onSubmit={(e) => { e.preventDefault(); if (topic.trim().length >= 2) record.mutate(); }}>
      <h2 className="text-lg font-semibold">Record a session</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Labeled label="Date"><input className={inputCls} type="date" value={heldOn} onChange={(e) => setHeldOn(e.target.value)} /></Labeled>
        <Labeled label="Topic"><input className={inputCls} value={topic} onChange={(e) => setTopic(e.target.value)} /></Labeled>
        <Labeled label="Lesson (optional)"><input className={inputCls} value={lesson} onChange={(e) => setLesson(e.target.value)} /></Labeled>
      </div>
      <fieldset>
        <legend className="text-sm font-medium text-gray-700">Who was present</legend>
        <div className="mt-1 grid gap-1 sm:grid-cols-2">
          {group.members.map((m) => (
            <label key={m.membershipId} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(present[m.membershipId])} onChange={(e) => setPresent({ ...present, [m.membershipId]: e.target.checked })} /> {m.name}</label>
          ))}
        </div>
      </fieldset>
      {record.error != null && <ErrorNotice message={getApiErrorMessage(record.error)} />}
      <button type="submit" className={primaryBtn} disabled={record.isPending}>Save session</button>
    </form>
  );
};

export const GroupDetailPage = () => {
  const { id = '' } = useParams();
  const permissions = useAuthStore((s) => s.user?.permissions);
  const allowed = can(permissions, 'group:view');
  const group = useQuery({ queryKey: ['groups', id], enabled: allowed, queryFn: async () => (await apiClient.get<GroupDetail>(`/api/v2/groups/${id}`)).data });
  const sessions = useQuery({ queryKey: ['groups', id, 'sessions'], enabled: allowed, queryFn: async () => (await apiClient.get<{ items: GroupSessionRow[]; total: number }>(`/api/v2/groups/${id}/sessions`)).data });
  const summary = useQuery({ queryKey: ['groups', id, 'summary'], enabled: allowed, queryFn: async () => (await apiClient.get<AttendanceSummary>(`/api/v2/groups/${id}/attendance-summary`)).data });
  const g = group.data;
  return (
    <MainLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <Link to="/groups" className="text-sm font-medium text-primary-600">← Groups</Link>
        <AdminHeader title={g?.name ?? 'Group'} subtitle={g ? `${titleCase(g.status)}${g.meetingDay ? ` · ${titleCase(g.meetingDay)}` : ''}${g.curriculumName ? ` · ${g.curriculumName}` : ''}` : undefined} />
        {!allowed && <NoAccess permission="group:view" />}
        {allowed && group.isLoading && <LoadingBlock />}
        {group.isError && <ErrorBlock error={group.error} onRetry={() => group.refetch()} />}
        {g && <Members group={g} canManage={can(permissions, 'group:manage')} />}
        {g && can(permissions, 'group:attendance:record') && g.status !== 'CLOSED' && <RecordSession group={g} />}
        {sessions.data && (
          <section className={card}>
            <h2 className="text-lg font-semibold">Sessions</h2>
            {sessions.data.items.length === 0 ? <EmptyBlock message="No sessions recorded." /> : (
              <ul className="mt-2 divide-y divide-gray-100 text-sm">
                {sessions.data.items.map((s) => <li key={s.id} className="py-2">{formatDate(s.heldOn)} — {s.topic}{s.lesson ? ` (${s.lesson})` : ''} · {s.present}/{s.recorded} present</li>)}
              </ul>
            )}
          </section>
        )}
        {summary.data && summary.data.members.length > 0 && (
          <section className={card}>
            <h2 className="text-lg font-semibold">Attendance summary ({summary.data.sessions} session(s))</h2>
            <table className="mt-2 w-full text-left text-sm">
              <thead><tr className="text-gray-500"><th className="py-1">Member</th><th>Present</th><th>Rate</th></tr></thead>
              <tbody>{summary.data.members.map((m) => <tr key={m.membershipId}><td className="py-1">{m.name}</td><td>{m.present}/{m.recorded}</td><td>{m.rate === null ? '—' : `${m.rate}%`}</td></tr>)}</tbody>
            </table>
          </section>
        )}
      </div>
    </MainLayout>
  );
};
export default GroupDetailPage;
