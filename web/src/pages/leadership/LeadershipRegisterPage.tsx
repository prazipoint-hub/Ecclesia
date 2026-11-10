import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { ImportJobPanel } from '@/components/imports/ImportJobPanel';
import { EmptyBlock, ErrorBlock, LoadingBlock, card, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { AdminHeader, NoAccess } from '@/pages/admin/adminShared';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { td, th, toDateInput, usePermissions } from '@/pages/finance/financeShared';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';

const B = '/api/v2/leadership-register';
interface Appt { id: string; member: { name: string; membershipNumber: string }; position: { code: string; name: string; groupName: string | null }; scope: { type: string }; termStart: string; termEnd: string | null; status: string; current: boolean }

export const LeadershipRegisterPage = () => {
  const has = usePermissions();
  const qc = useQueryClient();
  const [asOf, setAsOf] = useState('');
  const [tab, setTab] = useState<'register' | 'import'>('register');
  const [revoking, setRevoking] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const list = useQuery({
    queryKey: ['appointments', asOf], enabled: has('leadership:appointment:view') || has('leadership:appointment:manage') || has('leadership:appointment:approve'),
    queryFn: async () => (await apiClient.get<{ total: number; appointments: Appt[] }>(`${B}/appointments`, { params: { ...(asOf ? { asOf } : {}), pageSize: 100 } })).data,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['appointments'] });
  const approve = useMutation({ mutationFn: (id: string) => apiClient.post(`${B}/appointments/${id}/approve`), onSuccess: refresh });
  const revoke = useMutation({ mutationFn: (id: string) => apiClient.post(`${B}/appointments/${id}/revoke`, { reason: reason.trim() || undefined }), onSuccess: () => { setRevoking(null); setReason(''); refresh(); } });

  return (
    <MainLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <AdminHeader title="Leadership register" subtitle="Appointments with their terms. Approving an appointment is what grants any access mapped to the position." />
        <div role="tablist" className="flex gap-1">
          {(['register', 'import'] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === t ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100'}`}>{t === 'register' ? 'Register' : 'Import'}</button>)}
        </div>
        {tab === 'import' ? (
          has('leadership:import') ? <ImportJobPanel kind="LEADERSHIP" base={`${B}/import`} templateUrl={`${B}/import/template`} templateName="ecclesia-leadership-template.csv" /> : <NoAccess permission="leadership:import" />
        ) : (
          <section className={card}>
            <label className="mb-3 inline-flex items-center gap-2 text-sm text-gray-700">As at
              <input type="date" className="rounded border px-2 py-1" value={asOf} max="2100-01-01" onChange={(e) => setAsOf(e.target.value)} />
              {asOf && <button type="button" className="text-xs underline" onClick={() => setAsOf('')}>Today</button>}
            </label>
            {approve.error && <ErrorNotice message={getApiErrorMessage(approve.error)} />}
            {revoke.error && <ErrorNotice message={getApiErrorMessage(revoke.error)} />}
            {list.isLoading ? <LoadingBlock /> : list.error ? <ErrorBlock error={list.error} /> : !list.data?.appointments.length ? <EmptyBlock message="No appointments for this date." /> : (
              <div className="overflow-x-auto"><table className="w-full"><caption className="sr-only">Appointments</caption>
                <thead><tr><th className={th}>Person</th><th className={th}>Position</th><th className={th}>Level</th><th className={th}>Term</th><th className={th}>Status</th><th className={th}><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>{list.data.appointments.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className={td}>{a.member.name} <span className="text-xs text-gray-400">{a.member.membershipNumber}</span></td>
                    <td className={td}>{a.position.name}{a.position.groupName && <span className="text-xs text-gray-400"> · {a.position.groupName}</span>}</td>
                    <td className={td}>{a.scope.type.toLowerCase()}</td>
                    <td className={td}>{toDateInput(a.termStart)} to {a.termEnd ? toDateInput(a.termEnd) : 'open'}</td>
                    <td className={td}>{a.status.toLowerCase()}{a.status === 'ACTIVE' && !a.current && ' (not in force on this date)'}</td>
                    <td className={td}>
                      {a.status === 'PENDING' && has('leadership:appointment:approve') && <button type="button" className={primaryBtn} disabled={approve.isPending} onClick={() => approve.mutate(a.id)}>Approve</button>}
                      {['PENDING', 'ACTIVE'].includes(a.status) && has('leadership:appointment:approve') && (revoking === a.id ? (
                        <span className="flex flex-wrap items-center gap-2"><input aria-label="Reason" className="rounded border px-2 py-1 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} /><button type="button" className={secondaryBtn} onClick={() => revoke.mutate(a.id)}>Confirm revoke</button></span>
                      ) : <button type="button" className={`${secondaryBtn} ml-2`} onClick={() => setRevoking(a.id)}>Revoke</button>)}
                    </td>
                  </tr>))}</tbody></table></div>
            )}
          </section>
        )}
      </div>
    </MainLayout>
  );
};
