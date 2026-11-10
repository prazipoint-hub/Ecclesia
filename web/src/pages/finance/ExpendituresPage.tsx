import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { EmptyBlock, ErrorBlock, LoadingBlock, card, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { AdminHeader, NoAccess } from '@/pages/admin/adminShared';
import { useAuthStore } from '@stores/authStore';
import { apiClient } from '@/utils/api';
import { ApiError, FinanceNav, money, td, th, toDateInput, usePermissions } from './financeShared';

interface Exp { id: string; fundId: string; amount: number; purpose: string; category: string; status: string; requestedAt: string; paidAt: string | null; approvalsRecorded: number }
interface Policy { dualApprovalThreshold: number | null }
const STATUSES = ['SUBMITTED', 'APPROVED', 'PAID', 'REJECTED'] as const;
type Outcome = { awaitingSecondApproval?: boolean; approvalsNeeded?: number; approvalsRecorded?: number };

export const ExpendituresPage = () => {
  const has = usePermissions();
  const churchId = useAuthStore((s) => s.user?.churchId);
  const qc = useQueryClient();
  const base = `/api/v2/churches/${churchId}`;
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('SUBMITTED');
  const list = useQuery({ queryKey: ['expenditures', churchId, status], enabled: has('finance:view') && !!churchId, queryFn: async () => (await apiClient.get<{ expenditures: Exp[] }>(`${base}/expenditures`, { params: { status } })).data.expenditures });
  const funds = useQuery({ queryKey: ['funds-list'], enabled: has('finance:expenditure:create'), queryFn: async () => (await apiClient.get<Array<{ id: string; name: string; isActive: boolean }>>('/api/v2/accounting/funds')).data });
  const policy = useQuery({ queryKey: ['expense-policy'], enabled: has('finance:view'), queryFn: async () => (await apiClient.get<Policy>('/api/v2/accounting/expenditure-policy')).data });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['expenditures'] });
  const [form, setForm] = useState({ fundId: '', amount: '', purpose: '', category: 'Administrative' });
  const create = useMutation({ mutationFn: () => apiClient.post(`${base}/expenditures`, { fundId: form.fundId, amount: Number(form.amount), purpose: form.purpose.trim(), category: form.category.trim() }), onSuccess: () => { setForm({ ...form, amount: '', purpose: '' }); refresh(); } });
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const decide = useMutation({
    mutationFn: async (v: { id: string; approved: boolean }) => (await apiClient.post<Outcome>(`${base}/expenditures/${v.id}/approve`, { approved: v.approved, ...(notes.trim() && { approverNotes: notes.trim() }) })).data,
    onSuccess: (r) => { setNotes(''); setMessage(r.awaitingSecondApproval ? `Your approval is recorded (${r.approvalsRecorded} of ${r.approvalsNeeded}). A different person must approve too.` : null); refresh(); },
  });
  const pay = useMutation({ mutationFn: (id: string) => apiClient.post(`${base}/expenditures/${id}/pay`, { paymentMethod: 'BANK_TRANSFER' }), onSuccess: refresh });
  const fundName = (id: string) => funds.data?.find((f) => f.id === id)?.name ?? '';

  return (
    <MainLayout>
      <div className="space-y-6">
        <AdminHeader title="Expenditures" subtitle="Request, approve and pay. You cannot approve or pay your own request." />
        <FinanceNav />
        {!has('finance:view') ? <NoAccess permission="finance:view" /> : (
          <>
            {policy.data?.dualApprovalThreshold != null && <p className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">Requests of {money(policy.data.dualApprovalThreshold)} or more need two different approvers.</p>}
            {has('finance:expenditure:create') && (
              <section className={card}>
                <h2 className="mb-3 text-lg font-medium text-gray-900">New request</h2>
                {create.error && <ApiError error={create.error} />}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-gray-700">Fund
                    <select className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" value={form.fundId} onChange={(e) => setForm({ ...form, fundId: e.target.value })}>
                      <option value="">Choose…</option>{funds.data?.filter((f) => f.isActive).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </label>
                  <FormField type="number" min="0.01" step="0.01" label="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                  <FormField label="Purpose" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
                  <FormField label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                </div>
                <button type="button" className={`${primaryBtn} mt-3`} disabled={create.isPending || !form.fundId || !(Number(form.amount) > 0) || form.purpose.trim().length < 3} onClick={() => create.mutate()}>Submit request</button>
              </section>
            )}
            <section className={card}>
              <div role="tablist" className="mb-3 flex gap-1">
                {STATUSES.map((s) => <button key={s} role="tab" aria-selected={status === s} type="button" onClick={() => setStatus(s)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${status === s ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100'}`}>{s.charAt(0) + s.slice(1).toLowerCase()}</button>)}
              </div>
              {(decide.error || pay.error) && <ApiError error={decide.error ?? pay.error} />}
              {message && <p role="status" className="mb-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</p>}
              {status === 'SUBMITTED' && has('finance:expenditure:approve') && <FormField label="Note for your decision (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />}
              {list.isLoading ? <LoadingBlock /> : list.error ? <ErrorBlock error={list.error} /> : !list.data?.length ? <EmptyBlock message="Nothing here." /> : (
                <div className="overflow-x-auto"><table className="w-full"><caption className="sr-only">Expenditures</caption>
                  <thead><tr><th className={th}>Requested</th><th className={th}>Purpose</th><th className={th}>Fund</th><th className={th}>Amount</th><th className={th}>Approvals</th><th className={th}><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>{list.data.map((x) => (
                    <tr key={x.id} className="border-t">
                      <td className={td}>{toDateInput(x.requestedAt)}</td><td className={td}>{x.purpose}<span className="block text-xs text-gray-400">{x.category}</span></td><td className={td}>{fundName(x.fundId)}</td><td className={`${td} tabular-nums`}>{money(x.amount)}</td><td className={td}>{x.approvalsRecorded}</td>
                      <td className={td}>
                        {x.status === 'SUBMITTED' && has('finance:expenditure:approve') && <span className="flex gap-2"><button type="button" className={primaryBtn} disabled={decide.isPending} onClick={() => decide.mutate({ id: x.id, approved: true })}>Approve</button><button type="button" className={secondaryBtn} disabled={decide.isPending} onClick={() => decide.mutate({ id: x.id, approved: false })}>Reject</button></span>}
                        {x.status === 'APPROVED' && has('finance:payment:create') && <button type="button" className={primaryBtn} disabled={pay.isPending} onClick={() => pay.mutate(x.id)}>Record payment</button>}
                      </td>
                    </tr>))}</tbody></table></div>
              )}
            </section>
          </>
        )}
      </div>
    </MainLayout>
  );
};
