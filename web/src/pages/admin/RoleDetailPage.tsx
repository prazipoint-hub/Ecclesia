import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { Modal } from '@/components/forms/Modal';
import { ErrorBlock, LoadingBlock, card, formatDate, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { useAuthStore } from '@stores/authStore';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import { can } from '@/types/notifications';
import type { PermissionInfo, RoleDetail } from '@/types/admin';
import { AdminHeader, NoAccess } from './adminShared';
import { ROLES_KEY } from './RolesPage';

const PERMISSION = 'admin:role:manage';

export const RoleDetailPage = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const allowed = can(useAuthStore((s) => s.user?.permissions), PERMISSION);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  const role = useQuery({ queryKey: ['admin', 'role', id], enabled: allowed, queryFn: async () => (await apiClient.get<RoleDetail>(`/api/v2/admin/roles/${id}`)).data });
  const permissions = useQuery({ queryKey: ['admin', 'permissions'], enabled: allowed, queryFn: async () => (await apiClient.get<PermissionInfo[]>('/api/v2/admin/permissions')).data });

  useEffect(() => {
    if (role.data) {
      setName(role.data.name);
      setDescription(role.data.description ?? '');
      setSelected(new Set(role.data.permissions));
    }
  }, [role.data]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'role', id] });
    queryClient.invalidateQueries({ queryKey: ROLES_KEY });
  };
  const saveDetails = useMutation({ mutationFn: async () => apiClient.put(`/api/v2/admin/roles/${id}`, { name: name.trim(), description: description.trim() || null }), onSuccess: refresh });
  const savePerms = useMutation({ mutationFn: async () => apiClient.put(`/api/v2/admin/roles/${id}/permissions`, { permissions: [...selected].sort() }), onSuccess: refresh });
  const remove = useMutation({
    mutationFn: async () => apiClient.delete(`/api/v2/admin/roles/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ROLES_KEY });
      navigate('/admin/roles');
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, PermissionInfo[]>();
    for (const p of permissions.data ?? []) map.set(p.area, [...(map.get(p.area) ?? []), p]);
    return [...map.entries()];
  }, [permissions.data]);

  const editable = role.data?.editable ?? false;
  const toggle = (permission: PermissionInfo) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(permission.name)) next.delete(permission.name);
      else next.add(permission.name);
      return next;
    });

  return (
    <MainLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <AdminHeader title={role.data?.name ?? 'Role'} subtitle="Change what this role allows. People holding it are signed out when permissions are removed." action={<Link to="/admin/roles" className={secondaryBtn}>All roles</Link>} />
        {!allowed && <NoAccess permission={PERMISSION} />}
        {allowed && (role.isLoading || permissions.isLoading) && <LoadingBlock />}
        {role.isError && <ErrorBlock error={role.error} onRetry={() => role.refetch()} />}
        {role.data && (
          <>
            {!editable && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">This role carries permissions you do not hold, so you can view it but not change it.</p>}
            <section className={`${card} space-y-4`}>
              <h2 className="font-semibold text-gray-900">Details</h2>
              <FormField label="Name" value={name} maxLength={80} disabled={!editable} onChange={(e) => setName(e.target.value)} />
              <FormField label="Description" value={description} maxLength={300} disabled={!editable} onChange={(e) => setDescription(e.target.value)} />
              {saveDetails.error != null && <ErrorNotice message={getApiErrorMessage(saveDetails.error)} />}
              <button type="button" className={primaryBtn} disabled={!editable || name.trim().length < 2 || saveDetails.isPending} onClick={() => saveDetails.mutate()}>Save details</button>
            </section>

            <section className={`${card} space-y-4`}>
              <h2 className="font-semibold text-gray-900">Permissions ({selected.size})</h2>
              <p className="text-xs text-gray-500">You can only grant permissions you hold yourself; others are greyed out.</p>
              {grouped.map(([area, items]) => (
                <fieldset key={area} className="space-y-1">
                  <legend className="text-sm font-semibold capitalize text-gray-700">{area}</legend>
                  {items.map((p) => (
                    <label key={p.name} className={`flex items-center gap-2 text-sm ${p.grantable ? 'text-gray-800' : 'text-gray-400'}`}>
                      <input type="checkbox" checked={selected.has(p.name)} disabled={!editable || !p.grantable} onChange={() => toggle(p)} />
                      <span>{p.name}</span>
                      {p.description && <span className="text-xs text-gray-500">— {p.description}</span>}
                    </label>
                  ))}
                </fieldset>
              ))}
              {savePerms.error != null && <ErrorNotice message={getApiErrorMessage(savePerms.error)} />}
              <button type="button" className={primaryBtn} disabled={!editable || savePerms.isPending} onClick={() => savePerms.mutate()}>{savePerms.isPending ? 'Saving…' : 'Save permissions'}</button>
            </section>

            <section className={card}>
              <h2 className="mb-2 font-semibold text-gray-900">People holding this role ({role.data.assignees.length})</h2>
              {role.data.assignees.length === 0 ? <p className="text-sm text-gray-500">Nobody holds this role right now.</p> : (
                <ul className="divide-y divide-gray-100 text-sm">
                  {role.data.assignees.map((a) => (
                    <li key={a.id} className="flex justify-between py-2"><span>{a.member.firstName} {a.member.lastName}{a.position ? ` · ${a.position}` : ''}</span><span className="text-gray-500">since {formatDate(a.startDate)}</span></li>
                  ))}
                </ul>
              )}
            </section>

            <section className={card}>
              <button type="button" className={secondaryBtn} disabled={!editable} onClick={() => { remove.reset(); setConfirmDelete(true); }}>Delete role</button>
            </section>
          </>
        )}
      </div>
      <Modal open={confirmDelete} title="Delete role" onClose={() => setConfirmDelete(false)}
        footer={<><button type="button" className={secondaryBtn} onClick={() => setConfirmDelete(false)}>Cancel</button><button type="button" className={primaryBtn} disabled={remove.isPending} onClick={() => remove.mutate()}>Delete</button></>}>
        <p className="text-sm text-gray-700">Delete “{role.data?.name}”? Roles that were ever assigned to someone cannot be deleted.</p>
        {remove.error != null && <div className="mt-3"><ErrorNotice message={getApiErrorMessage(remove.error)} /></div>}
      </Modal>
    </MainLayout>
  );
};

export default RoleDetailPage;
