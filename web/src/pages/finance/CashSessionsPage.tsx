import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { FormTextarea } from '@/components/forms/FormTextarea';
import { EmptyBlock, ErrorBlock, LoadingBlock, card, primaryBtn } from '@/pages/account/shared';
import { AdminHeader, NoAccess } from '@/pages/admin/adminShared';
import { apiClient } from '@/utils/api';
import type { CashSession, CurrentCashSession } from '@/types/accounting';
import { ApiError, FinanceNav, money, num, statusBadge, td, th, toDateInput, usePermissions } from './financeShared';

const CURRENT = ['accounting', 'cash-sessions', 'current'] as const;
const LIST = ['accounting', 'cash-sessions'] as const;

export const varianceClass = (variance: number | null): string =>
  variance === null || variance === 0 ? 'text-gray-800' : variance < 0 ? 'font-medium text-red-600' : 'font-medium text-amber-600';

export const CashSessionsPage = () => {
  const has = usePermissions();
  const queryClient = useQueryClient();
  const canManage = has('finance:cash_session:manage');
  const current = useQuery({ queryKey: CURRENT, enabled: canManage, queryFn: async () => (await apiClient.get<CurrentCashSession | null>('/api/v2/accounting/cash-sessions/current')).data });
  const list = useQuery({ queryKey: LIST, queryFn: async () => (await apiClient.get<CashSession[]>('/api/v2/accounting/cash-sessions')).data });
  const [opening, setOpening] = useState('');
  const [counted, setCounted] = useState('');
  const [paidOut, setPaidOut] = useState('');
  const [notes, setNotes] = useState('');
  const [closed, setClosed] = useState<CashSession | null>(null);
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: CURRENT }); void queryClient.invalidateQueries({ queryKey: LIST }); };

  const open = useMutation({ mutationFn: () => apiClient.post('/api/v2/accounting/cash-sessions', { openingBalance: Number(opening) }), onSuccess: () => { setOpening(''); setClosed(null); refresh(); } });
  const close = useMutation({
    mutationFn: (id: string) =>
      apiClient.post<CashSession>(`/api/v2/accounting/cash-sessions/${id}/close`, { countedBalance: Number(counted), cashPaidOut: Number(paidOut || 0), ...(notes.trim() && { notes: notes.trim() }) }),
    onSuccess: (res) => { setClosed(res.data); setCounted(''); setPaidOut(''); setNotes(''); refresh(); },
  });
  const session = current.data;

  return (
    <MainLayout>
      <div className="space-y-6">
        <AdminHeader title="Cash sessions" subtitle="Count the cash at the end of each service and explain any difference." />
        <FinanceNav />
        {!has('finance:view') ? <NoAccess permission="finance:view" /> : (
          <>
            {canManage && (
              <section className={card}>
                <h2 className="mb-3 text-lg font-medium text-gray-900">Current session</h2>
                {current.isLoading ? <LoadingBlock /> : current.error ? <ErrorBlock error={current.error} /> : session ? (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-600">Opened {toDateInput(session.openedAt)} with {money(session.openingBalance)}. Cash received so far: <strong>{money(session.cashReceivedSoFar)}</strong>. Expected before payouts: <strong>{money(session.expectedBeforePayouts)}</strong>.</p>
                    {close.error && <ApiError error={close.error} />}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <FormField type="number" min="0" step="0.01" label="Counted cash" value={counted} onChange={(e) => setCounted(e.target.value)} />
                      <FormField type="number" min="0" step="0.01" label="Cash paid out" value={paidOut} onChange={(e) => setPaidOut(e.target.value)} />
                    </div>
                    <FormTextarea label="Notes (required if the count differs)" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                    <button type="button" className={primaryBtn} disabled={counted === '' || close.isPending} onClick={() => close.mutate(session.id)}>{close.isPending ? 'Closing…' : 'Close session'}</button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {closed && (
                      <p role="status" className="rounded-lg bg-gray-50 p-3 text-sm">
                        Session closed. Expected {money(closed.expectedBalance)}, counted {money(closed.countedBalance)}, variance <span className={varianceClass(closed.variance)}>{money(closed.variance)}</span>.
                      </p>
                    )}
                    <p className="text-sm text-gray-600">No session is open.</p>
                    {open.error && <ApiError error={open.error} />}
                    <FormField type="number" min="0" step="0.01" label="Opening cash" value={opening} onChange={(e) => setOpening(e.target.value)} />
                    <button type="button" className={primaryBtn} disabled={opening === '' || open.isPending} onClick={() => open.mutate()}>Open session</button>
                  </div>
                )}
              </section>
            )}
            <section className={card}>
              <h2 className="mb-3 text-lg font-medium text-gray-900">History</h2>
              {list.isLoading ? <LoadingBlock /> : list.error ? <ErrorBlock error={list.error} /> : list.data && list.data.length === 0 ? <EmptyBlock message="No sessions yet." /> : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead><tr><th className={th}>Opened</th><th className={th}>Status</th><th className={`${th} text-right`}>Opening</th><th className={`${th} text-right`}>Expected</th><th className={`${th} text-right`}>Counted</th><th className={`${th} text-right`}>Variance</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {list.data?.map((s) => (
                      <tr key={s.id}>
                        <td className={td}>{toDateInput(s.openedAt)}</td><td className={td}><span className={statusBadge(s.status)}>{s.status === 'OPEN' ? 'Open' : 'Closed'}</span></td>
                        <td className={num}>{money(s.openingBalance)}</td><td className={num}>{money(s.expectedBalance)}</td><td className={num}>{money(s.countedBalance)}</td>
                        <td className={`${num} ${varianceClass(s.variance)}`}>{money(s.variance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}
      </div>
    </MainLayout>
  );
};
