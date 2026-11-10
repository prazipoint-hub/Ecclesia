import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { EmptyBlock, ErrorBlock, LoadingBlock, card, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { td, th, toDateInput } from '@/pages/finance/financeShared';
import { useAuthStore } from '@stores/authStore';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import { AdminHeader } from './adminShared';

const A = '/api/v2/access';
type ScopeType = 'CONFERENCE' | 'DISTRICT' | 'CIRCUIT' | 'CHURCH';
interface Unit { key: string; scopeType: ScopeType; scopeId: string; name: string }
interface CircuitRow { id: string; name: string; district: { id: string; name: string } | null; conference: { id: string; name: string } | null }
interface Grant { id: string; userId: string; email: string | null; role: { id: string; name: string }; sourceType: string; endsAt: string | null; createdAt: string }

export const AccessAssignmentsPage = () => {
  const churchId = useAuthStore((s) => s.user?.churchId);
  const qc = useQueryClient();
  const circuits = useQuery({ queryKey: ['hierarchy', 'circuits', 'units'], retry: false, queryFn: async () => (await apiClient.get<{ circuits: CircuitRow[] }>('/api/v2/hierarchy/circuits', { params: { take: 100 } })).data.circuits });
  const units = useMemo<Unit[]>(() => {
    const out = new Map<string, Unit>();
    if (churchId) out.set(`CHURCH:${churchId}`, { key: `CHURCH:${churchId}`, scopeType: 'CHURCH', scopeId: churchId, name: 'My church' });
    for (const c of circuits.data ?? []) {
      if (c.conference) out.set(`CONFERENCE:${c.conference.id}`, { key: `CONFERENCE:${c.conference.id}`, scopeType: 'CONFERENCE', scopeId: c.conference.id, name: `${c.conference.name} (conference)` });
      if (c.district) out.set(`DISTRICT:${c.district.id}`, { key: `DISTRICT:${c.district.id}`, scopeType: 'DISTRICT', scopeId: c.district.id, name: `${c.district.name} (district)` });
      out.set(`CIRCUIT:${c.id}`, { key: `CIRCUIT:${c.id}`, scopeType: 'CIRCUIT', scopeId: c.id, name: `${c.name} (circuit)` });
    }
    return [...out.values()];
  }, [circuits.data, churchId]);
  const [unitKey, setUnitKey] = useState('');
  const unit = units.find((u) => u.key === (unitKey || units[0]?.key));
  const scope = unit ? { scopeType: unit.scopeType, scopeId: unit.scopeId } : null;

  const grants = useQuery({ queryKey: ['access', 'grants', scope], enabled: !!scope, retry: false, queryFn: async () => (await apiClient.get<{ assignments: Grant[] }>(`${A}/assignments`, { params: scope })).data.assignments });
  const roles = useQuery({ queryKey: ['access', 'roles', scope], enabled: !!scope, retry: false, queryFn: async () => (await apiClient.get<{ roles: Array<{ id: string; name: string; church: string; permissionCount: number }> }>(`${A}/assignable-roles`, { params: scope })).data.roles });
  const [search, setSearch] = useState('');
  const found = useQuery({ queryKey: ['access', 'users', scope, search], enabled: !!scope && search.trim().length >= 3, retry: false, queryFn: async () => (await apiClient.get<{ users: Array<{ id: string; email: string; name: string | null }> }>(`${A}/users`, { params: { ...scope, q: search.trim() } })).data.users });
  const [userId, setUserId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const refresh = () => void qc.invalidateQueries({ queryKey: ['access', 'grants'] });
  const assign = useMutation({ mutationFn: () => apiClient.post(`${A}/assignments`, { userId, roleId, ...scope, ...(endsAt ? { endsAt: new Date(`${endsAt}T23:59:59Z`).toISOString() } : {}) }), onSuccess: () => { setUserId(''); setSearch(''); setEndsAt(''); refresh(); } });
  const [revoking, setRevoking] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const revoke = useMutation({ mutationFn: (id: string) => apiClient.delete(`${A}/assignments/${id}`, { data: { reason: reason.trim() || undefined } }), onSuccess: () => { setRevoking(null); setReason(''); refresh(); } });

  return (
    <MainLayout>
      <div className="mx-auto max-w-5xl space-y-6">
        <AdminHeader title="Access by unit" subtitle="Give a person a role for one church, circuit, district or conference. You can only give permissions you hold there, and you cannot change your own access." />
        <section className={card}>
          <label className="block text-sm font-medium text-gray-700">Unit
            <select className="mt-1 w-full max-w-md rounded-lg border border-gray-300 px-3 py-2" value={unit?.key ?? ''} onChange={(e) => { setUnitKey(e.target.value); setUserId(''); setRoleId(''); }}>
              {units.map((u) => <option key={u.key} value={u.key}>{u.name}</option>)}
            </select>
          </label>
        </section>

        {grants.error ? <ErrorNotice message={getApiErrorMessage(grants.error)} /> : (
          <>
            <section className={card}>
              <h2 className="mb-3 text-lg font-medium text-gray-900">Give access</h2>
              {assign.error && <ErrorNotice message={getApiErrorMessage(assign.error)} />}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <FormField label="Find the person by email (3+ characters)" value={search} onChange={(e) => { setSearch(e.target.value); setUserId(''); }} />
                  {found.data && (found.data.length ? (
                    <select aria-label="Person" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" value={userId} onChange={(e) => setUserId(e.target.value)}>
                      <option value="">Choose…</option>{found.data.map((u) => <option key={u.id} value={u.id}>{u.name ? `${u.name} — ` : ''}{u.email}</option>)}
                    </select>
                  ) : <p className="mt-1 text-sm text-gray-500">No account in this unit matches.</p>)}
                </div>
                <label className="block text-sm font-medium text-gray-700">Role
                  <select className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                    <option value="">Choose…</option>{roles.data?.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.church}, {r.permissionCount} permissions)</option>)}
                  </select>
                </label>
                <FormField type="date" label="Ends on (optional)" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </div>
              <button type="button" className={`${primaryBtn} mt-3`} disabled={!userId || !roleId || assign.isPending} onClick={() => assign.mutate()}>Give access</button>
            </section>

            <section className={card}>
              <h2 className="mb-3 text-lg font-medium text-gray-900">Who has access here</h2>
              {revoke.error && <ErrorNotice message={getApiErrorMessage(revoke.error)} />}
              {grants.isLoading ? <LoadingBlock /> : !grants.data?.length ? <EmptyBlock message="Nobody holds a role directly at this unit." /> : (
                <div className="overflow-x-auto"><table className="w-full"><caption className="sr-only">Role grants</caption>
                  <thead><tr><th className={th}>Account</th><th className={th}>Role</th><th className={th}>Source</th><th className={th}>Ends</th><th className={th}><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>{grants.data.map((g) => (
                    <tr key={g.id} className="border-t">
                      <td className={td}>{g.email ?? g.userId}</td><td className={td}>{g.role.name}</td><td className={td}>{g.sourceType === 'APPOINTMENT' ? 'appointment' : 'manual'}</td><td className={td}>{g.endsAt ? toDateInput(g.endsAt) : '—'}</td>
                      <td className={td}>{revoking === g.id ? (
                        <span className="flex flex-wrap items-center gap-2"><input aria-label="Reason" className="rounded border px-2 py-1 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} /><button type="button" className={secondaryBtn} onClick={() => revoke.mutate(g.id)}>Confirm remove</button></span>
                      ) : <button type="button" className={secondaryBtn} onClick={() => setRevoking(g.id)}>Remove</button>}</td>
                    </tr>))}</tbody></table></div>
              )}
              {roles.error && <ErrorBlock error={roles.error} />}
            </section>
          </>
        )}
      </div>
    </MainLayout>
  );
};
