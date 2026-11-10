import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { FormTextarea } from '@/components/forms/FormTextarea';
import { EmptyBlock, ErrorBlock, LoadingBlock, card, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { AdminHeader, NoAccess } from '@/pages/admin/adminShared';
import { apiClient } from '@/utils/api';
import type { Deposit, TreasurerOverview } from '@/types/treasury';
import { ApiError, FinanceNav, money, statusBadge, td, th, today, toDateInput, usePermissions } from './financeShared';

const OVERVIEW = ['accounting', 'treasurer', 'overview'] as const;
const LIST = ['accounting', 'deposits'] as const;

const Tile = ({ title, value, hint }: { title: string; value: Record<string, string>; hint: string }) => (
  <div className="rounded-md border border-gray-200 p-4">
    <h3 className="text-sm font-medium text-gray-600">{title}</h3>
    <p className="mt-1 text-lg font-medium tabular-nums text-gray-900">{Object.keys(value).length ? Object.entries(value).map(([c, v]) => <span key={c} className="mr-3 whitespace-nowrap">{c} {v}</span>) : '—'}</p>
    <p className="mt-1 text-xs text-gray-500">{hint}</p>
  </div>
);

export const DepositsPage = () => {
  const has = usePermissions();
  const queryClient = useQueryClient();
  const overview = useQuery({ queryKey: OVERVIEW, enabled: has('finance:view'), queryFn: async () => (await apiClient.get<TreasurerOverview>('/api/v2/accounting/treasurer/overview')).data });
  const list = useQuery({ queryKey: LIST, enabled: has('finance:view'), queryFn: async () => (await apiClient.get<{ deposits: Deposit[] }>('/api/v2/accounting/deposits')).data.deposits });
  const [form, setForm] = useState({ currency: 'USD', amount: '', depositDate: today(), bankReference: '', bankName: '', cashSessionId: '', notes: '' });
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: OVERVIEW }); void queryClient.invalidateQueries({ queryKey: LIST }); };
  const record = useMutation({
    mutationFn: () => apiClient.post('/api/v2/accounting/deposits', {
      currency: form.currency, amount: Number(form.amount), depositDate: form.depositDate, bankReference: form.bankReference,
      ...(form.bankName.trim() && { bankName: form.bankName.trim() }), ...(form.cashSessionId && { cashSessionId: form.cashSessionId }), ...(form.notes.trim() && { notes: form.notes.trim() }),
    }),
    onSuccess: () => { setForm({ ...form, amount: '', bankReference: '', notes: '' }); refresh(); },
  });
  const verify = useMutation({ mutationFn: (id: string) => apiClient.post(`/api/v2/accounting/deposits/${id}/verify`), onSuccess: refresh });
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const reject = useMutation({ mutationFn: (id: string) => apiClient.post(`/api/v2/accounting/deposits/${id}/reject`, { reason: reason.trim() }), onSuccess: () => { setRejecting(null); setReason(''); refresh(); } });
  const o = overview.data;

  return (
    <MainLayout>
      <div className="space-y-6">
        <AdminHeader title="Treasurer: deposits" subtitle="A deposit moves cash to the bank. It is not new income. A different person must verify it against the bank slip." />
        <FinanceNav />
        {!has('finance:view') ? <NoAccess permission="finance:view" /> : (
          <>
            <section className={card} aria-label="Overview">
              {overview.isLoading ? <LoadingBlock /> : overview.error ? <ErrorBlock error={overview.error} /> : o && (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Tile title="Approved cash" value={o.approvedCash} hint={`${o.approvedSessions} reviewed session(s)`} />
                    <Tile title="Pending approval (not included above)" value={o.pendingCash} hint={`${o.pendingSessions} submitted session(s)`} />
                    <Tile title="Undeposited cash" value={o.undepositedCash} hint="Approved cash minus deposits recorded" />
                    <Tile title="Deposits verified" value={o.depositsVerified} hint="Confirmed against bank evidence" />
                    <Tile title="Deposits awaiting verification" value={o.depositsAwaitingVerification} hint="Recorded, not yet verified" />
                  </div>
                  {o.sessionsOutstanding.length > 0 && (
                    <div><h3 className="mb-1 text-sm font-medium text-gray-700">Approved sessions with cash not yet deposited</h3>
                      <ul className="space-y-1 text-sm text-gray-700">{o.sessionsOutstanding.map((s) => <li key={s.id}>{toDateInput(s.sessionDate)}: {Object.entries(s.outstanding).map(([c, v]) => `${c} ${v}`).join(', ')} <span className="text-xs text-gray-400">({s.id})</span></li>)}</ul></div>
                  )}
                  <div><h3 className="mb-1 text-sm font-medium text-gray-700">Fund balances</h3>
                    {o.funds.length ? <ul className="grid gap-1 text-sm text-gray-700 sm:grid-cols-2">{o.funds.map((f) => <li key={f.id}>{f.name}{f.isRestricted && ' (restricted)'}: <strong className="tabular-nums">{money(f.balance)}</strong></li>)}</ul> : <p className="text-sm text-gray-500">No funds yet.</p>}
                  </div>
                  <p className="text-xs text-gray-500">{o.note}</p>
                </div>
              )}
            </section>

            {has('finance:deposit:record') && (
              <section className={card}>
                <h2 className="mb-3 text-lg font-medium text-gray-900">Record a deposit</h2>
                {record.error && <ApiError error={record.error} />}
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Currency (3 letters)" maxLength={3} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
                  <FormField type="number" min="0.01" step="0.01" label="Amount deposited" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                  <FormField type="date" label="Deposit date" max={today()} value={form.depositDate} onChange={(e) => setForm({ ...form, depositDate: e.target.value })} />
                  <FormField label="Bank slip / reference" value={form.bankReference} onChange={(e) => setForm({ ...form, bankReference: e.target.value })} />
                  <FormField label="Bank (optional)" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
                  <FormField label="Cash session id (optional, links to an approved session)" value={form.cashSessionId} onChange={(e) => setForm({ ...form, cashSessionId: e.target.value.trim() })} />
                </div>
                <FormTextarea label="Notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                <button type="button" className={`${primaryBtn} mt-3`} disabled={record.isPending || !form.amount || form.currency.length !== 3 || form.bankReference.trim().length < 3} onClick={() => record.mutate()}>{record.isPending ? 'Saving…' : 'Record deposit'}</button>
              </section>
            )}

            <section className={card}>
              <h2 className="mb-3 text-lg font-medium text-gray-900">Deposits</h2>
              {verify.error && <ApiError error={verify.error} />}
              {reject.error && <ApiError error={reject.error} />}
              {list.isLoading ? <LoadingBlock /> : list.error ? <ErrorBlock error={list.error} /> : !list.data?.length ? <EmptyBlock message="No deposits recorded." /> : (
                <div className="overflow-x-auto"><table className="w-full"><caption className="sr-only">Deposits</caption>
                  <thead><tr><th className={th}>Date</th><th className={th}>Reference</th><th className={th}>Amount</th><th className={th}>Status</th><th className={th}><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>{list.data.map((d) => (
                    <tr key={d.id} className="border-t">
                      <td className={td}>{toDateInput(d.depositDate)}</td><td className={td}>{d.bankReference}</td><td className={td}>{d.currency} {money(d.amount)}</td>
                      <td className={td}><span className={statusBadge(d.status === 'VERIFIED' ? 'APPROVED' : d.status === 'PENDING' ? 'OPEN' : 'REVERSED')}>{d.status.toLowerCase()}</span>{d.rejectReason && <span className="ml-2 text-xs text-gray-500">{d.rejectReason}</span>}</td>
                      <td className={td}>{d.status === 'PENDING' && has('finance:deposit:verify') && (
                        rejecting === d.id ? (
                          <span className="flex flex-wrap items-center gap-2"><input aria-label="Reason" className="rounded border px-2 py-1 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} /><button type="button" className={secondaryBtn} disabled={reason.trim().length < 5} onClick={() => reject.mutate(d.id)}>Confirm reject</button></span>
                        ) : (
                          <span className="flex gap-2"><button type="button" className={primaryBtn} disabled={verify.isPending} onClick={() => verify.mutate(d.id)}>Verify</button><button type="button" className={secondaryBtn} onClick={() => setRejecting(d.id)}>Reject</button></span>
                        ))}</td>
                    </tr>))}</tbody>
                </table></div>
              )}
            </section>
          </>
        )}
      </div>
    </MainLayout>
  );
};
