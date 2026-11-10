import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { FormTextarea } from '@/components/forms/FormTextarea';
import { Modal } from '@/components/forms/Modal';
import { ErrorBlock, LoadingBlock, card, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { AdminHeader, NoAccess } from '@/pages/admin/adminShared';
import { apiClient } from '@/utils/api';
import type { JournalEntry, JournalInput } from '@/types/accounting';
import { useAccounts, useFunds } from './financeQueries';
import { ApiError, FinanceNav, money, num, statusBadge, td, th, today, toDateInput, usePermissions } from './financeShared';

interface DraftLine { accountId: string; debit: string; credit: string; memo: string; fundId: string }
const blank = (): DraftLine => ({ accountId: '', debit: '', credit: '', memo: '', fundId: '' });
const cents = (v: string) => Math.round((Number(v) || 0) * 100);
const sel = 'block w-full rounded-lg border border-gray-300 px-2 py-2 text-sm';

export const lineProblem = (l: DraftLine): string | null => {
  const d = cents(l.debit);
  const c = cents(l.credit);
  if (d > 0 && c > 0) return 'Enter a debit or a credit, not both';
  if (d <= 0 && c <= 0) return 'Enter a debit or a credit';
  if (!l.accountId) return 'Choose an account';
  return null;
};

export const JournalEditorPage = () => {
  const { journalId } = useParams();
  const isNew = !journalId;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const has = usePermissions();
  const accounts = useAccounts();
  const funds = useFunds();
  const entry = useQuery({
    queryKey: ['accounting', 'journals', 'detail', journalId],
    enabled: !isNew,
    queryFn: async () => (await apiClient.get<JournalEntry>(`/api/v2/accounting/journals/${journalId}`)).data,
  });
  const [description, setDescription] = useState('');
  const [postDate, setPostDate] = useState(today());
  const [lines, setLines] = useState<DraftLine[]>([blank(), blank()]);
  const [reversing, setReversing] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!entry.data) return;
    setDescription(entry.data.description);
    setPostDate(toDateInput(entry.data.postDate));
    setLines(entry.data.lines.map((l) => ({ accountId: l.accountId, debit: l.debit ? String(l.debit) : '', credit: l.credit ? String(l.credit) : '', memo: l.memo ?? '', fundId: l.fundId ?? '' })));
  }, [entry.data]);

  const readOnly = !isNew && entry.data?.status !== 'DRAFT';
  const totalDebit = lines.reduce((s, l) => s + cents(l.debit), 0) / 100;
  const totalCredit = lines.reduce((s, l) => s + cents(l.credit), 0) / 100;
  const difference = Math.round((totalDebit - totalCredit) * 100) / 100;
  const problems = lines.map(lineProblem);
  const canSave = !readOnly && description.trim() !== '' && lines.length >= 2 && problems.every((p) => p === null) && difference === 0 && totalDebit > 0;

  const payload = (): JournalInput => ({
    description: description.trim(),
    postDate,
    lines: lines.map((l) => ({ accountId: l.accountId, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, ...(l.memo.trim() && { memo: l.memo.trim() }), ...(l.fundId && { fundId: l.fundId }) })),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['accounting'] });

  const save = useMutation({
    mutationFn: async () => (isNew ? apiClient.post<JournalEntry>('/api/v2/accounting/journals', payload()) : apiClient.put<JournalEntry>(`/api/v2/accounting/journals/${journalId}`, payload())),
    onSuccess: (res) => { refresh(); if (isNew) navigate(`/finance/journals/${res.data.id}`, { replace: true }); },
  });
  const post = useMutation({ mutationFn: () => apiClient.post(`/api/v2/accounting/journals/${journalId}/post`), onSuccess: refresh });
  const remove = useMutation({ mutationFn: () => apiClient.delete(`/api/v2/accounting/journals/${journalId}`), onSuccess: () => { refresh(); navigate('/finance/journals'); } });
  const reverse = useMutation({
    mutationFn: () => apiClient.post<JournalEntry>(`/api/v2/accounting/journals/${journalId}/reverse`, { reason: reason.trim() }),
    onSuccess: (res) => { refresh(); setReversing(false); setReason(''); navigate(`/finance/journals/${res.data.id}`); },
  });

  const update = (i: number, patch: Partial<DraftLine>) => setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const activeAccounts = (accounts.data ?? []).filter((a) => a.isActive);
  const activeFunds = (funds.data ?? []).filter((f) => f.isActive);
  const e = entry.data;

  if (!has('finance:view')) return <MainLayout><NoAccess permission="finance:view" /></MainLayout>;

  return (
    <MainLayout>
      <div className="space-y-6">
        <AdminHeader title={isNew ? 'New journal entry' : e ? `Journal ${e.reference}` : 'Journal entry'} action={<Link to="/finance/journals" className={secondaryBtn}>Back to journals</Link>} />
        <FinanceNav />
        {!isNew && entry.isLoading ? <LoadingBlock /> : entry.error ? <ErrorBlock error={entry.error} /> : (
          <div className={`${card} space-y-4`}>
            {e && (
              <p className="text-sm text-gray-600">
                <span className={statusBadge(e.status)}>{e.status}</span> · Source {e.source}
                {e.reversalReason && <> · Reason: {e.reversalReason}</>}
                {e.reversesEntryId && <> · <Link className="text-primary-600 underline" to={`/finance/journals/${e.reversesEntryId}`}>Reverses another entry</Link></>}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField className="sm:col-span-2" label="Description" value={description} disabled={readOnly} onChange={(ev) => setDescription(ev.target.value)} />
              <FormField type="date" label="Post date" value={postDate} disabled={readOnly} onChange={(ev) => setPostDate(ev.target.value)} />
            </div>
            <table className="min-w-full">
              <thead><tr><th className={th}>Account</th><th className={th}>Fund</th><th className={th}>Memo</th><th className={`${th} text-right`}>Debit</th><th className={`${th} text-right`}>Credit</th><th /></tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="align-top">
                    <td className={td}>
                      <select aria-label={`Line ${i + 1} account`} className={sel} value={l.accountId} disabled={readOnly} onChange={(ev) => update(i, { accountId: ev.target.value })}>
                        <option value="">Select account</option>
                        {(readOnly ? accounts.data ?? [] : activeAccounts).map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                      </select>
                    </td>
                    <td className={td}>
                      <select aria-label={`Line ${i + 1} fund`} className={sel} value={l.fundId} disabled={readOnly} onChange={(ev) => update(i, { fundId: ev.target.value })}>
                        <option value="">No fund</option>
                        {(readOnly ? funds.data ?? [] : activeFunds).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                    </td>
                    <td className={td}><input aria-label={`Line ${i + 1} memo`} className={sel} value={l.memo} disabled={readOnly} onChange={(ev) => update(i, { memo: ev.target.value })} /></td>
                    <td className={td}><input aria-label={`Line ${i + 1} debit`} type="number" min="0" step="0.01" className={`${sel} text-right`} value={l.debit} disabled={readOnly} onChange={(ev) => update(i, { debit: ev.target.value })} /></td>
                    <td className={td}>
                      <input aria-label={`Line ${i + 1} credit`} type="number" min="0" step="0.01" className={`${sel} text-right`} value={l.credit} disabled={readOnly} onChange={(ev) => update(i, { credit: ev.target.value })} />
                      {!readOnly && problems[i] && (l.debit !== '' || l.credit !== '') && <p role="alert" className="mt-1 text-xs text-red-600">{problems[i]}</p>}
                    </td>
                    <td className={td}>{!readOnly && lines.length > 2 && <button type="button" aria-label={`Remove line ${i + 1}`} className="text-gray-500 hover:text-red-600" onClick={() => setLines(lines.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></button>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className={td}>{!readOnly && <button type="button" className="inline-flex items-center gap-1 text-sm font-medium text-primary-600" onClick={() => setLines([...lines, blank()])}><Plus className="h-4 w-4" /> Add line</button>}</td>
                  <td className={`${num} font-medium`} data-testid="total-debit">{money(totalDebit)}</td>
                  <td className={`${num} font-medium`} data-testid="total-credit">{money(totalCredit)}</td><td />
                </tr>
              </tfoot>
            </table>
            {!readOnly && (
              <p role="status" className={`text-sm ${difference === 0 && totalDebit > 0 ? 'text-green-700' : 'text-red-600'}`}>
                {difference === 0 ? (totalDebit > 0 ? 'Balanced' : 'Enter amounts') : `Out of balance by ${money(Math.abs(difference))}`}
              </p>
            )}
            {(save.error || post.error || remove.error) && <ApiError error={save.error ?? post.error ?? remove.error} />}
            <div className="flex flex-wrap gap-2">
              {!readOnly && has('finance:journal:create') && <button type="button" className={primaryBtn} disabled={!canSave || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save draft'}</button>}
              {!isNew && e?.status === 'DRAFT' && has('finance:journal:approve') && <button type="button" className={secondaryBtn} disabled={post.isPending} onClick={() => post.mutate()}>Post entry</button>}
              {!isNew && e?.status === 'DRAFT' && has('finance:journal:create') && <button type="button" className={secondaryBtn} disabled={remove.isPending} onClick={() => remove.mutate()}>Delete draft</button>}
              {e?.status === 'POSTED' && e.source !== 'REVERSAL' && has('finance:journal:reverse') && <button type="button" className={secondaryBtn} onClick={() => setReversing(true)}>Reverse entry</button>}
            </div>
          </div>
        )}
      </div>
      <Modal open={reversing} title="Reverse entry" onClose={() => setReversing(false)}
        footer={<><button type="button" className={secondaryBtn} onClick={() => setReversing(false)}>Cancel</button><button type="button" className={primaryBtn} disabled={!reason.trim() || reverse.isPending} onClick={() => reverse.mutate()}>Reverse</button></>}>
        {reverse.error && <ApiError error={reverse.error} />}
        <p className="mb-3 text-sm text-gray-600">A new entry is posted that cancels this one. The original stays on record.</p>
        <FormTextarea label="Reason" value={reason} onChange={(ev) => setReason(ev.target.value)} />
      </Modal>
    </MainLayout>
  );
};
