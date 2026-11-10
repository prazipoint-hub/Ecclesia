import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { FormTextarea } from '@/components/forms/FormTextarea';
import { EmptyBlock, ErrorBlock, LoadingBlock, card, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { AdminHeader, NoAccess } from '@/pages/admin/adminShared';
import { apiClient } from '@/utils/api';
import { ApiError, FinanceNav, td, th, today, toDateInput, usePermissions } from './financeShared';

const B = '/api/v2/accounting/reconciliations';
interface Head { id: string; currency: string; periodStart: string; periodEnd: string; statementClosing: string; status: string; createdBy: string }
interface Summary { statementClosing: string; ledgerBalance: string; unmatchedStatementCount: number; unmatchedStatementNet: string; unmatchedLedgerCount: number; unmatchedLedgerNet: string; adjustedBank: string; adjustedBook: string; difference: string }
interface Line { id: string; lineDate: string; description: string; reference: string | null; amount: string; status: string }
interface BookLine { journalLineId: string; date: string; reference: string; description: string; amount: string }
interface Detail extends Head { summary: Summary; statementLines?: Line[]; unmatchedBook?: BookLine[] }

/** "date,description,reference,amount" per line. Quoted fields are not supported; the preview shows what will be sent. */
export const parseStatement = (text: string) => {
  const lines: Array<{ date: string; description: string; reference?: string; amount: number }> = [];
  const errors: string[] = [];
  text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((raw, i) => {
    if (i === 0 && /^date/i.test(raw)) return;
    const [date, description, reference, amount] = raw.split(',').map((p) => p.trim());
    const n = Number((amount ?? '').replace(/\s/g, ''));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !description || !amount || !Number.isFinite(n) || n === 0) errors.push(`Row ${i + 1}: expected YYYY-MM-DD,description,reference,amount`);
    else lines.push({ date, description, ...(reference ? { reference } : {}), amount: n });
  });
  return { lines, errors };
};

const Detail = ({ id }: { id: string }) => {
  const has = usePermissions();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['recon', id], queryFn: async () => (await apiClient.get<Detail>(`${B}/${id}`)).data });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['recon'] });
  const [text, setText] = useState('');
  const [pick, setPick] = useState<Record<string, string>>({});
  const parsed = parseStatement(text);
  const upload = useMutation({ mutationFn: () => apiClient.post(`${B}/${id}/statement`, { lines: parsed.lines }), onSuccess: () => { setText(''); refresh(); } });
  const auto = useMutation({ mutationFn: () => apiClient.post(`${B}/${id}/auto-match`), onSuccess: refresh });
  const match = useMutation({ mutationFn: (lineId: string) => apiClient.post(`${B}/${id}/match`, { lineId, journalLineId: pick[lineId] }), onSuccess: refresh });
  const unmatch = useMutation({ mutationFn: (lineId: string) => apiClient.post(`${B}/${id}/lines/${lineId}/unmatch`), onSuccess: refresh });
  const complete = useMutation({ mutationFn: () => apiClient.post(`${B}/${id}/complete`), onSuccess: refresh });
  const d = q.data;
  if (q.isLoading) return <LoadingBlock />;
  if (q.error || !d) return <ErrorBlock error={q.error} />;
  const draft = d.status === 'DRAFT';
  const manage = has('finance:reconcile:manage');
  const s = d.summary;
  const unmatched = (d.statementLines ?? []).filter((l) => l.status === 'UNMATCHED');
  const matched = (d.statementLines ?? []).filter((l) => l.status === 'MATCHED');

  return (
    <div className="space-y-4">
      <section className={card} aria-label="Summary">
        <h2 className="mb-2 text-lg font-medium text-gray-900">{toDateInput(d.periodStart)} to {toDateInput(d.periodEnd)} ({d.currency}) — {d.status.toLowerCase()}</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-gray-500">Statement closing</dt><dd className="tabular-nums">{s.statementClosing}</dd></div>
          <div><dt className="text-gray-500">Ledger bank balance</dt><dd className="tabular-nums">{s.ledgerBalance}</dd></div>
          <div><dt className="text-gray-500">In ledger, not on statement ({s.unmatchedLedgerCount})</dt><dd className="tabular-nums">{s.unmatchedLedgerNet}</dd></div>
          <div><dt className="text-gray-500">On statement, not in ledger ({s.unmatchedStatementCount})</dt><dd className="tabular-nums">{s.unmatchedStatementNet}</dd></div>
          <div><dt className="text-gray-500">Adjusted bank</dt><dd className="tabular-nums">{s.adjustedBank}</dd></div>
          <div><dt className="text-gray-500">Adjusted ledger</dt><dd className="tabular-nums">{s.adjustedBook}</dd></div>
          <div><dt className="text-gray-500">Difference</dt><dd className={`font-medium tabular-nums ${s.difference === '0.00' ? 'text-green-700' : 'text-red-700'}`}>{s.difference}</dd></div>
        </dl>
        {draft && has('finance:reconcile:complete') && (
          <div className="mt-3">
            {complete.error && <ApiError error={complete.error} />}
            <button type="button" className={primaryBtn} disabled={complete.isPending || s.difference !== '0.00'} onClick={() => complete.mutate()}>Complete reconciliation</button>
            <p className="mt-1 text-xs text-gray-500">Needs a zero difference and a different person from the one who started it.</p>
          </div>
        )}
      </section>

      {draft && manage && (
        <section className={card} aria-label="Import statement">
          <h3 className="mb-2 font-medium text-gray-900">Add statement lines</h3>
          {upload.error && <ApiError error={upload.error} />}
          <FormTextarea label="One per line: YYYY-MM-DD,description,reference,amount (money in positive, money out negative)" rows={5} value={text} onChange={(e) => setText(e.target.value)} />
          {parsed.errors.length > 0 && <p role="alert" className="text-sm text-red-700">{parsed.errors.slice(0, 3).join(' ')}</p>}
          <div className="mt-2 flex gap-2">
            <button type="button" className={primaryBtn} disabled={upload.isPending || !parsed.lines.length || parsed.errors.length > 0} onClick={() => upload.mutate()}>Add {parsed.lines.length} line(s)</button>
            <button type="button" className={secondaryBtn} disabled={auto.isPending} onClick={() => auto.mutate()}>Match obvious pairs</button>
          </div>
          {auto.data && <p className="mt-1 text-sm text-gray-600">Matched {(auto.data.data as { matched: number }).matched} pair(s). Same amount, within 5 days, no competing candidate.</p>}
        </section>
      )}

      <section className={card} aria-label="Unmatched statement lines">
        <h3 className="mb-2 font-medium text-gray-900">Statement lines not matched</h3>
        {match.error && <ApiError error={match.error} />}
        {unmatched.length === 0 ? <EmptyBlock message="No unmatched statement lines." /> : (
          <div className="overflow-x-auto"><table className="w-full"><caption className="sr-only">Unmatched statement lines</caption>
            <thead><tr><th className={th}>Date</th><th className={th}>Description</th><th className={th}>Amount</th><th className={th}>Ledger line</th></tr></thead>
            <tbody>{unmatched.map((l) => {
              const options = (d.unmatchedBook ?? []).filter((b) => b.amount === l.amount);
              return (
                <tr key={l.id} className="border-t">
                  <td className={td}>{toDateInput(l.lineDate)}</td><td className={td}>{l.description}{l.reference && <span className="text-xs text-gray-400"> {l.reference}</span>}</td><td className={`${td} tabular-nums`}>{l.amount}</td>
                  <td className={td}>{draft && manage && (options.length ? (
                    <span className="flex gap-2">
                      <select aria-label={`Ledger line for ${l.description}`} className="rounded border px-2 py-1 text-sm" value={pick[l.id] ?? ''} onChange={(e) => setPick({ ...pick, [l.id]: e.target.value })}>
                        <option value="">Choose…</option>{options.map((b) => <option key={b.journalLineId} value={b.journalLineId}>{toDateInput(b.date)} {b.reference} {b.description}</option>)}
                      </select>
                      <button type="button" className={secondaryBtn} disabled={!pick[l.id] || match.isPending} onClick={() => match.mutate(l.id)}>Match</button>
                    </span>
                  ) : <span className="text-xs text-gray-500">No ledger line with this exact amount. It counts as a reconciling item.</span>)}</td>
                </tr>);
            })}</tbody></table></div>
        )}
      </section>

      <section className={card} aria-label="Ledger lines not on the statement">
        <h3 className="mb-2 font-medium text-gray-900">Ledger bank lines not on the statement</h3>
        {!d.unmatchedBook?.length ? <EmptyBlock message="Every ledger bank line up to the statement date is matched." /> : (
          <ul className="space-y-1 text-sm text-gray-700">{d.unmatchedBook.map((b) => <li key={b.journalLineId}>{toDateInput(b.date)} {b.reference} {b.description}: <strong className="tabular-nums">{b.amount}</strong></li>)}</ul>
        )}
      </section>

      {matched.length > 0 && (
        <section className={card} aria-label="Matched lines">
          <h3 className="mb-2 font-medium text-gray-900">Matched ({matched.length})</h3>
          {unmatch.error && <ApiError error={unmatch.error} />}
          <ul className="space-y-1 text-sm text-gray-700">{matched.map((l) => <li key={l.id}>{toDateInput(l.lineDate)} {l.description}: <span className="tabular-nums">{l.amount}</span> {draft && manage && <button type="button" className="ml-2 text-xs underline" onClick={() => unmatch.mutate(l.id)}>Unmatch</button>}</li>)}</ul>
        </section>
      )}
    </div>
  );
};

export const BankReconciliationPage = () => {
  const has = usePermissions();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['recon', 'list'], enabled: has('finance:view'), queryFn: async () => (await apiClient.get<{ reconciliations: Head[] }>(B)).data.reconciliations });
  const [open, setOpen] = useState<string | null>(null);
  const [f, setF] = useState({ currency: 'USD', periodStart: '', periodEnd: today(), statementOpening: '', statementClosing: '' });
  const start = useMutation({
    mutationFn: async () => (await apiClient.post<Head>(B, { currency: f.currency, periodStart: f.periodStart, periodEnd: f.periodEnd, statementOpening: Number(f.statementOpening), statementClosing: Number(f.statementClosing) })).data,
    onSuccess: (h) => { void qc.invalidateQueries({ queryKey: ['recon'] }); setOpen(h.id); },
  });
  const ready = f.currency.length === 3 && f.periodStart && f.periodEnd && f.statementOpening !== '' && f.statementClosing !== '';

  return (
    <MainLayout>
      <div className="space-y-6">
        <AdminHeader title="Bank reconciliation" subtitle="Match the bank statement to the ledger's Bank account. This is separate from cash counts and deposit verification." />
        <FinanceNav />
        {!has('finance:view') ? <NoAccess permission="finance:view" /> : (
          <>
            {has('finance:reconcile:manage') && (
              <section className={card}>
                <h2 className="mb-3 text-lg font-medium text-gray-900">Start a reconciliation</h2>
                {start.error && <ApiError error={start.error} />}
                <div className="grid gap-3 sm:grid-cols-3">
                  <FormField label="Currency" maxLength={3} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} />
                  <FormField type="date" label="Statement from" value={f.periodStart} onChange={(e) => setF({ ...f, periodStart: e.target.value })} />
                  <FormField type="date" label="Statement to" value={f.periodEnd} onChange={(e) => setF({ ...f, periodEnd: e.target.value })} />
                  <FormField type="number" step="0.01" label="Statement opening balance" value={f.statementOpening} onChange={(e) => setF({ ...f, statementOpening: e.target.value })} />
                  <FormField type="number" step="0.01" label="Statement closing balance" value={f.statementClosing} onChange={(e) => setF({ ...f, statementClosing: e.target.value })} />
                </div>
                <button type="button" className={`${primaryBtn} mt-3`} disabled={!ready || start.isPending} onClick={() => start.mutate()}>Start</button>
              </section>
            )}
            <section className={card}>
              <h2 className="mb-3 text-lg font-medium text-gray-900">Reconciliations</h2>
              {list.isLoading ? <LoadingBlock /> : list.error ? <ErrorBlock error={list.error} /> : !list.data?.length ? <EmptyBlock message="No reconciliations yet." /> : (
                <ul className="space-y-1 text-sm">{list.data.map((r) => <li key={r.id}><button type="button" className="underline" onClick={() => setOpen(r.id)}>{toDateInput(r.periodStart)} to {toDateInput(r.periodEnd)} {r.currency}</button> <span className="text-gray-500">{r.status.toLowerCase()}</span></li>)}</ul>
              )}
            </section>
            {open && <Detail key={open} id={open} />}
          </>
        )}
      </div>
    </MainLayout>
  );
};
