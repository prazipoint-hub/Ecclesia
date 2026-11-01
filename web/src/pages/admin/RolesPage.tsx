import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { Modal } from '@/components/forms/Modal';
import { EmptyBlock, ErrorBlock, LoadingBlock, card, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { useAuthStore } from '@stores/authStore';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import { can } from '@/types/notifications';
import type { RoleSummary } from '@/types/admin';
import { AdminHeader, NoAccess } from './adminShared';

const PERMISSION = 'admin:role:manage';
export const ROLES_KEY = ['admin', 'roles'] as const;

export const RolesPage = () => {
  const allowed = can(useAuthStore((s) => s.user?.permissions), PERMISSION);
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState<string>();

  const roles = useQuery({ queryKey: ROLES_KEY, enabled: allowed, queryFn: async () => (await apiClient.get<RoleSummary[]>('/api/v2/admin/roles')).data });
  const create = useMutation({
    mutationFn: async () => (await apiClient.post('/api/v2/admin/roles', { name: name.trim(), ...(description.trim() ? { description: description.trim() } : {}) })).data,
    onSuccess: () => {
      setCreating(false);
      setName('');
      setDescription('');
      queryClient.invalidateQueries({ queryKey: ROLES_KEY });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) return setNameError('Enter a name of at least 2 characters.');
    setNameError(undefined);
    create.mutate();
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <AdminHeader
          title="Roles"
          subtitle="A role is a set of permissions. Assign roles to people from the Users page."
          action={allowed && <button type="button" className={primaryBtn} onClick={() => { create.reset(); setCreating(true); }}>New role</button>}
        />
        {!allowed && <NoAccess permission={PERMISSION} />}
        {allowed && roles.isLoading && <LoadingBlock />}
        {roles.isError && <ErrorBlock error={roles.error} onRetry={() => roles.refetch()} />}
        {roles.data && roles.data.length === 0 && <EmptyBlock message="No roles yet." />}
        {roles.data && roles.data.length > 0 && (
          <ul className="space-y-3">
            {roles.data.map((role) => (
              <li key={role.id} className={card}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Link to={`/admin/roles/${role.id}`} className="font-semibold text-primary-700 hover:underline">{role.name}</Link>
                    {role.description && <p className="text-sm text-gray-600">{role.description}</p>}
                  </div>
                  <p className="text-sm text-gray-500">{role.permissionCount} permissions · {role.assignmentCount} assignments</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Modal open={creating} title="New role" onClose={() => setCreating(false)}>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormField label="Name" value={name} error={nameError} maxLength={80} onChange={(e) => setName(e.target.value)} />
          <FormField label="Description (optional)" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
          {create.error != null && <ErrorNotice message={getApiErrorMessage(create.error)} />}
          <div className="flex justify-end gap-2">
            <button type="button" className={secondaryBtn} onClick={() => setCreating(false)}>Cancel</button>
            <button type="submit" className={primaryBtn} disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create role'}</button>
          </div>
        </form>
      </Modal>
    </MainLayout>
  );
};

export default RolesPage;
