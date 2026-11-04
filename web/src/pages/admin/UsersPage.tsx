import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { FormSelect } from '@/components/forms/FormSelect';
import { Modal } from '@/components/forms/Modal';
import { EmptyBlock, ErrorBlock, LoadingBlock, card, formatDate, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { useAuthStore } from '@stores/authStore';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import { can } from '@/types/notifications';
import type { AdminUser, AdminUserList, RoleSummary } from '@/types/admin';
import { AdminHeader, NoAccess } from './adminShared';

const PERMISSION = 'admin:user:manage';
export const USERS_KEY = ['admin', 'users'] as const;

export const UserDetail = ({ user, onClose }: { user: AdminUser; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const canRoles = can(useAuthStore((s) => s.user?.permissions), 'admin:role:manage');
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string>();
  const [roleId, setRoleId] = useState('');
  const [message, setMessage] = useState<string>();

  const roles = useQuery({ queryKey: ['admin', 'roles'], enabled: canRoles, queryFn: async () => (await apiClient.get<RoleSummary[]>('/api/v2/admin/roles')).data });
  const done = (text?: string) => () => {
    setMessage(text);
    queryClient.invalidateQueries({ queryKey: USERS_KEY });
  };
  const base = `/api/v2/admin/users/${user.id}`;
  const disable = useMutation({ mutationFn: async () => apiClient.post(`${base}/disable`, { reason: reason.trim() }), onSuccess: () => { setReason(''); done('Account switched off.')(); onClose(); } });
  const enable = useMutation({ mutationFn: async () => apiClient.post(`${base}/enable`), onSuccess: () => { done()(); onClose(); } });
  const revoke = useMutation({ mutationFn: async () => (await apiClient.post<{ revoked: number }>(`${base}/revoke-sessions`)).data, onSuccess: (d) => done(`Signed out of ${d.revoked} session(s).`)() });
  const assign = useMutation({ mutationFn: async () => apiClient.post(`${base}/roles`, { roleId }), onSuccess: () => { setRoleId(''); done('Role assigned.')(); onClose(); } });
  const endRole = useMutation({ mutationFn: async (assignmentId: string) => apiClient.delete(`${base}/roles/${assignmentId}`), onSuccess: () => { done()(); onClose(); } });

  const submitDisable = (event: FormEvent) => {
    event.preventDefault();
    if (reason.trim().length < 5) return setReasonError('Give a reason of at least 5 characters.');
    setReasonError(undefined);
    disable.mutate();
  };
  const error = disable.error ?? enable.error ?? revoke.error ?? assign.error ?? endRole.error;

  return (
    <div className="space-y-4 text-sm">
      <p className="text-gray-600">{user.email}{user.membershipNumber ? ` · ${user.membershipNumber}` : ''}</p>
      <div>
        <h3 className="mb-1 font-semibold text-gray-900">Roles</h3>
        {user.roles.length === 0 ? <p className="text-gray-500">No roles.</p> : (
          <ul className="space-y-1">
            {user.roles.map((r) => (
              <li key={r.assignmentId} className="flex items-center justify-between">
                <span>{r.role}{r.position ? ` · ${r.position}` : ''} <span className="text-gray-500">since {formatDate(r.since)}</span></span>
                <button type="button" className={secondaryBtn} disabled={endRole.isPending} onClick={() => endRole.mutate(r.assignmentId)} aria-label={`End role ${r.role}`}>End role</button>
              </li>
            ))}
          </ul>
        )}
        {user.memberId && canRoles && (
          <div className="mt-2 flex items-end gap-2">
            <FormSelect className="flex-1" label="Assign a role" value={roleId} placeholder="Choose a role" options={(roles.data ?? []).map((r) => ({ value: r.id, label: r.name }))} onChange={(e) => setRoleId(e.target.value)} />
            <button type="button" className={primaryBtn} disabled={!roleId || assign.isPending} onClick={() => assign.mutate()}>Assign</button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondaryBtn} disabled={revoke.isPending} onClick={() => revoke.mutate()}>Sign out everywhere</button>
        {user.disabled && <button type="button" className={primaryBtn} disabled={enable.isPending} onClick={() => enable.mutate()}>Switch account back on</button>}
      </div>
      {user.disabled && <p className="text-gray-600">Switched off {formatDate(user.disabledAt)}: {user.disabledReason}</p>}
      {!user.disabled && (
        <form onSubmit={submitDisable} className="space-y-2 rounded-lg border border-red-200 p-3" noValidate>
          <FormField label="Reason for switching off this account" value={reason} error={reasonError} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          <button type="submit" className={secondaryBtn} disabled={disable.isPending}>Switch off account</button>
        </form>
      )}
      {message && <p role="status" className="text-green-700">{message}</p>}
      {error != null && <ErrorNotice message={getApiErrorMessage(error)} />}
    </div>
  );
};

export const UsersPage = () => {
  const allowed = can(useAuthStore((s) => s.user?.permissions), PERMISSION);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const users = useQuery({
    queryKey: [...USERS_KEY, q, status],
    enabled: allowed,
    queryFn: async () => (await apiClient.get<AdminUserList>('/api/v2/admin/users', { params: { ...(q ? { q } : {}), ...(status ? { status } : {}), take: 100 } })).data,
  });
  const selected = users.data?.items.find((u) => u.id === selectedId) ?? null;

  return (
    <MainLayout>
      <div className="mx-auto max-w-5xl space-y-6">
        <AdminHeader title="Users" subtitle="Manage sign-in accounts, their roles, and whether they can sign in." />
        {!allowed && <NoAccess permission={PERMISSION} />}
        {allowed && (
          <div className="flex flex-wrap gap-3">
            <FormField className="flex-1" label="Search" value={q} placeholder="Name or email" onChange={(e) => setQ(e.target.value)} />
            <FormSelect label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: '', label: 'All' }, { value: 'ACTIVE', label: 'Active' }, { value: 'DISABLED', label: 'Switched off' }]} />
          </div>
        )}
        {allowed && users.isLoading && <LoadingBlock />}
        {users.isError && <ErrorBlock error={users.error} onRetry={() => users.refetch()} />}
        {users.data && users.data.items.length === 0 && <EmptyBlock message="No users match." />}
        {users.data && users.data.items.length > 0 && (
          <ul className="space-y-2">
            {users.data.items.map((u) => (
              <li key={u.id} className={card}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{u.name ?? u.email}{u.disabled && <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">Switched off</span>}</p>
                    <p className="text-sm text-gray-600">{u.email} · {u.roles.map((r) => r.role).join(', ') || 'no roles'}</p>
                  </div>
                  <button type="button" className={secondaryBtn} onClick={() => setSelectedId(u.id)} aria-label={`Manage ${u.name ?? u.email}`}>Manage</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Modal open={selected !== null} title={selected?.name ?? selected?.email ?? 'User'} onClose={() => setSelectedId(null)}>
        {selected && <UserDetail user={selected} onClose={() => setSelectedId(null)} />}
      </Modal>
    </MainLayout>
  );
};

export default UsersPage;
