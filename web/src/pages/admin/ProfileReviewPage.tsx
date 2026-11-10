import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { EmptyBlock, ErrorBlock, LoadingBlock, card, primaryBtn, secondaryBtn, titleCase } from '@/pages/account/shared';
import { ApiError, td, th, usePermissions } from '@/pages/finance/financeShared';
import { apiClient } from '@/utils/api';
import type { CompletionReport, ProfileChange } from '@/types/treasury';
import { AdminHeader, NoAccess } from './adminShared';
import { FieldDefinitions, GuardianLinks } from '@/components/profile/ProfileAdminExtras';

const base = '/api/v2/profile-admin';
const ALL = ['firstName', 'lastName', 'phone', 'email', 'dateOfBirth', 'gender', 'maritalStatus', 'address', 'section', 'nextOfKin'];

export const ProfileReviewPage = () => {
  const has = usePermissions();
  const queryClient = useQueryClient();
  const canReview = has('member:profile:review');
  const canReport = has('member:profile:report');
  const canConfigure = has('member:profile:configure');
  const queue = useQuery({ queryKey: ['profile-admin', 'changes'], enabled: canReview, queryFn: async () => (await apiClient.get<{ requests: ProfileChange[] }>(`${base}/changes`)).data.requests });
  const report = useQuery({ queryKey: ['profile-admin', 'report'], enabled: canReport, queryFn: async () => (await apiClient.get<CompletionReport>(`${base}/report`)).data });
  const [note, setNote] = useState('');
  const [rule, setRule] = useState<string[] | null>(null);
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ['profile-admin'] }); };
  const decide = useMutation({ mutationFn: ({ id, verb }: { id: string; verb: 'approve' | 'reject' }) => apiClient.post(`${base}/changes/${id}/${verb}`, { note: note.trim() }), onSuccess: () => { setNote(''); refresh(); } });
  const saveRule = useMutation({ mutationFn: () => apiClient.put(`${base}/rule`, { fields: rule }), onSuccess: () => { setRule(null); refresh(); } });
  const current = rule ?? report.data?.required ?? [];

  if (!canReview && !canReport && !canConfigure) return <MainLayout><NoAccess permission="member:profile:review" /></MainLayout>;
  return (
    <MainLayout>
      <div className="space-y-6">
        <AdminHeader title="Profile reviews and completion" subtitle="Approve sensitive corrections and see how complete member profiles are. Counts only; no personal details are listed." />
        {canReview && (
          <section className={card}>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">Pending corrections</h2>
            {decide.error && <ApiError error={decide.error} />}
            {queue.isLoading ? <LoadingBlock /> : queue.error ? <ErrorBlock error={queue.error} /> : !queue.data?.length ? <EmptyBlock message="Nothing waiting." /> : (
              <>
                <label className="mb-3 block text-sm font-medium text-gray-700">Note for the member (required, 3+ characters)
                  <input className="mt-1 block w-full rounded-lg border-gray-300" value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
                <div className="overflow-x-auto"><table className="w-full"><caption className="sr-only">Pending profile corrections</caption>
                  <thead><tr><th className={th}>Detail</th><th className={th}>From</th><th className={th}>To</th><th className={th}><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>{queue.data.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className={td}>{titleCase(r.field)}</td><td className={td}>{r.oldValue ?? '—'}</td><td className={td}>{r.newValue}</td>
                      <td className={td}>{r.ownRequest ? <span className="text-gray-500">Your own request</span> : (
                        <span className="flex gap-2">
                          <button type="button" className={primaryBtn} disabled={note.trim().length < 3 || decide.isPending} onClick={() => decide.mutate({ id: r.id, verb: 'approve' })}>Approve</button>
                          <button type="button" className={secondaryBtn} disabled={note.trim().length < 3 || decide.isPending} onClick={() => decide.mutate({ id: r.id, verb: 'reject' })}>Reject</button>
                        </span>)}</td>
                    </tr>))}</tbody>
                </table></div>
              </>
            )}
          </section>
        )}
        {canReport && (
          <section className={card}>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">Completion</h2>
            {report.isLoading ? <LoadingBlock /> : report.error || !report.data ? <ErrorBlock error={report.error} /> : (
              <>
                <p className="text-sm text-gray-700">{report.data.complete} of {report.data.activeMembers} active members meet the rule. Average completion {report.data.averagePercent}%.{report.data.truncated && ' (First 20,000 members only.)'}</p>
                <ul className="mt-3 grid gap-1 text-sm text-gray-700 sm:grid-cols-2">{Object.entries(report.data.missingByField).map(([f, n]) => <li key={f}>{titleCase(f)} missing: <strong>{n}</strong></li>)}</ul>
              </>
            )}
          </section>
        )}
        {canConfigure && report.data && (
          <section className={card}>
            <h2 className="mb-1 text-lg font-semibold text-gray-900">Required details</h2>
            <p className="mb-3 text-sm text-gray-600">Tick the details a member must have for their profile to count as complete.</p>
            {saveRule.error && <ApiError error={saveRule.error} />}
            <div className="grid gap-2 sm:grid-cols-3">{ALL.map((f) => (
              <label key={f} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={current.includes(f)} onChange={(e) => setRule(e.target.checked ? [...current, f] : current.filter((x) => x !== f))} />{titleCase(f)}</label>))}
            </div>
            <button type="button" className={`${primaryBtn} mt-3`} disabled={rule === null || rule.length === 0 || saveRule.isPending} onClick={() => saveRule.mutate()}>Save rule</button>
          </section>
        )}
        {canConfigure && <FieldDefinitions />}
        {has('family:update') && <GuardianLinks />}
      </div>
    </MainLayout>
  );
};
