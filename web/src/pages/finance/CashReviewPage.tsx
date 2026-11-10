import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { FormTextarea } from '@/components/forms/FormTextarea';
import { EmptyBlock, ErrorBlock, LoadingBlock, card, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { AdminHeader, NoAccess } from '@/pages/admin/adminShared';
import { apiClient } from '@/utils/api';
import type { CashSessionDetail, ReviewQueueItem } from '@/types/treasury';
import { ApiError, FinanceNav, td, th, usePermissions } from './financeShared';

const QUEUE = ['accounting', 'cash-sessions', 'review-queue'] as const;
const base = '/api/v2/accounting/cash-sessions';

const MoneyList = ({ value }: { value: Record<string, string> }) => {
  const entries = Object.entries(value);
  return entries.length ? <>{entries.map(([cur, amt]) => <span key={cur} className="mr-3 whitespace-nowrap tabular-nums">{cur} {amt}</span>)}</> : <>—</>;
};

const ReviewPanel = ({ id, onDone }: { id: string; onDone: () => void }) => {
  const detail = useQuery({ queryKey: ['accounting', 'cash-sessions', id, 'detail'], queryFn: async () => (await apiClient.get<CashSessionDetail>(`${base}/${id}/detail`)).data });
  const [received, setReceived] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const d = detail.data;
  const approve = useMutation({
    mutationFn: () => apiClient.post(`${base}/${id}/approve`, { submissionNo: d!.submissionNo, received: d!.submission!.counts.map((c) => ({ currency: c.currency, amount: Number(received[c.currency]) })), ...(note.trim() && { note: note.trim() }) }),
    onSuccess: onDone,
  });
  const reject = useMutation({ mutationFn: () => apiClient.post(`${base}/${id}/reject`, { submissionNo: d!.submissionNo, reason: reason.trim() }), onSuccess: onDone });

  if (detail.isLoading) return <LoadingBlock />;
  if (detail.error || !d) return <ErrorBlock error={detail.error} />;
  const counts = d.submission?.counts ?? [];
  const allEntered = counts.length > 0 && counts.every((c) => received[c.currency] !== undefined && received[c.currency] !== '' && Number.isFinite(Number(received[c.currency])));
  return (
    <section className={card} aria-label="Session review">
      <h2 className="mb-3 text-lg font-medium text-gray-900">Review submission #{d.submissionNo}</h2>
      {d.changedSinceSubmission && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">Receipts changed after this was submitted. Approval will be refused; reject it so the cashier can resubmit.</p>}
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="font-medium text-gray-600">Expected cash (frozen at submission)</dt><dd><MoneyList value={d.snapshot?.expected ?? {}} /></dd></div>
        <div><dt className="font-medium text-gray-600">Cashier counted</dt><dd>{counts.map((c) => <span key={c.currency} className="mr-3 tabular-nums">{c.currency} {c.counted.toFixed(2)}</span>)}</dd></div>
        <div><dt className="font-medium text-gray-600">Non-cash collected (verified separately)</dt><dd><MoneyList value={d.snapshot?.other ?? {}} /></dd></div>
        <div><dt className="font-medium text-gray-600">Differences</dt><dd><MoneyList value={d.submission?.variances ?? {}} /></dd></div>
      </dl>
      {d.submission?.notes && <p className="mt-3 text-sm text-gray-700"><strong>Cashier note:</strong> {d.submission.notes}</p>}
      <div className="mt-4 overflow-x-auto"><table className="w-full"><caption className="sr-only">Receipts in this session</caption>
        <thead><tr><th className={th}>Receipt</th><th className={th}>Type</th><th className={th}>Method</th><th className={th}>Amount</th></tr></thead>
        <tbody>{d.receipts.map((r) => <tr key={r.receiptNumber} className="border-t"><td className={td}>{r.receiptNumber}{r.status !== 'ISSUED' && ` (${r.status.toLowerCase()})`}</td><td className={td}>{r.incomeType}</td><td className={td}>{r.paymentMethod}</td><td className={td}>{r.currency} {r.amount.toFixed(2)}</td></tr>)}</tbody>
      </table></div>
      {d.status === 'SUBMITTED' && (
        <div className="mt-5 space-y-4 border-t pt-4">
          <p className="text-sm text-gray-600">Count the cash you were handed and enter it yourself for each currency. It is not pre-filled.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {counts.map((c) => <FormField key={c.currency} type="number" min="0" step="0.01" label={`Cash received (${c.currency})`} value={received[c.currency] ?? ''} onChange={(e) => setReceived({ ...received, [c.currency]: e.target.value })} />)}
          </div>
          <FormTextarea label="Note (required if received differs from the count)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          {approve.error && <ApiError error={approve.error} />}
          <div className="flex flex-wrap gap-3">
            <button type="button" className={primaryBtn} disabled={!allEntered || approve.isPending} onClick={() => approve.mutate()}>{approve.isPending ? 'Approving…' : 'Approve handover'}</button>
          </div>
          <FormTextarea label="Reason for rejecting (at least 5 characters)" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          {reject.error && <ApiError error={reject.error} />}
          <button type="button" className={secondaryBtn} disabled={reason.trim().length < 5 || reject.isPending} onClick={() => reject.mutate()}>Reject and return to cashier</button>
        </div>
      )}
    </section>
  );
};

export const CashReviewPage = () => {
  const has = usePermissions();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const allowed = has('finance:cash_session:review');
  const queue = useQuery({ queryKey: QUEUE, enabled: allowed, queryFn: async () => (await apiClient.get<{ sessions: ReviewQueueItem[] }>(`${base}/review-queue`)).data.sessions });
  const done = () => { setSelected(null); void queryClient.invalidateQueries({ queryKey: QUEUE }); void queryClient.invalidateQueries({ queryKey: ['accounting', 'treasurer'] }); };
  return (
    <MainLayout>
      <div className="space-y-6">
        <AdminHeader title="Cash handover review" subtitle="Confirm the cash you received from each cashier. Approving records custody only; income was already recorded with each receipt." />
        <FinanceNav />
        {!allowed ? <NoAccess permission="finance:cash_session:review" /> : (
          <>
            <section className={card}>
              <h2 className="mb-3 text-lg font-medium text-gray-900">Awaiting review</h2>
              {queue.isLoading ? <LoadingBlock /> : queue.error ? <ErrorBlock error={queue.error} /> : !queue.data?.length ? <EmptyBlock message="No submitted sessions." /> : (
                <div className="overflow-x-auto"><table className="w-full"><caption className="sr-only">Submitted cash sessions</caption>
                  <thead><tr><th className={th}>Submitted</th><th className={th}>Expected cash</th><th className={th}>Receipts</th><th className={th}>Flags</th><th className={th}><span className="sr-only">Action</span></th></tr></thead>
                  <tbody>{queue.data.map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className={td}>{s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '—'}</td>
                      <td className={td}><MoneyList value={s.expected} /></td>
                      <td className={td}>{s.receiptCount}</td>
                      <td className={td}>{s.discrepancy && <span className="font-medium text-red-600">Count differs</span>}{s.ownSession && <span className="text-gray-500"> Your own session</span>}</td>
                      <td className={td}><button type="button" className={secondaryBtn} disabled={s.ownSession} title={s.ownSession ? 'You cannot review your own session' : undefined} onClick={() => setSelected(s.id)}>Review</button></td>
                    </tr>))}</tbody>
                </table></div>
              )}
            </section>
            {selected && <ReviewPanel key={selected} id={selected} onDone={done} />}
          </>
        )}
      </div>
    </MainLayout>
  );
};
