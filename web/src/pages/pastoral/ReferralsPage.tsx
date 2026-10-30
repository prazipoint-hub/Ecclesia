import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormField } from '@/components/forms/FormField';
import { FormSelect } from '@/components/forms/FormSelect';
import { FormTextarea } from '@/components/forms/FormTextarea';
import { Modal } from '@/components/forms/Modal';
import { Pagination, formatDate, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { apiClient } from '@/utils/api';
import { REFERRAL_NEXT, REFERRAL_STATUSES, REFERRAL_TYPES, type Referral } from '@/types/pastoral';
import { ApiError, DataState, P, PAGE_SIZE, Shell, Tag, label, memberName, selectOptions, td, th, usePagedList, usePermissions } from './pastoralShared';

const EMPTY = { caseId: '', referralType: 'MEDICAL', providerName: '', reason: '' };

export const ReferralsPage = () => {
  const has = usePermissions();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [completing, setCompleting] = useState<Referral | null>(null);
  const [outcome, setOutcome] = useState('');
  const list = usePagedList<Referral>('referrals', '/referrals', { status }, has('pastoral:referral:view'));
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['pastoral', 'referrals'] });
  const create = useMutation({
    mutationFn: () => apiClient.post(`${P}/referrals`, { ...draft, caseId: draft.caseId.trim(), providerName: draft.providerName.trim(), reason: draft.reason.trim() }),
    onSuccess: () => { refresh(); setAdding(false); setDraft(EMPTY); },
  });
  const move = useMutation({
    mutationFn: ({ id, ...body }: { id: string; status: string; outcome?: string }) => apiClient.put(`${P}/referrals/${id}`, body),
    onSuccess: () => { refresh(); setCompleting(null); setOutcome(''); },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!draft.caseId.trim()) next.caseId = 'Enter the case ID.';
    if (draft.providerName.trim().length < 2) next.providerName = 'Enter the provider.';
    if (draft.reason.trim().length < 10) next.reason = 'Give a reason (10+ characters).';
    setErrors(next);
    if (Object.keys(next).length === 0) create.mutate();
  };
  const canUpdate = has('pastoral:referral:update');

  return (
    <Shell title="Referrals" subtitle="Hand-offs to professionals and community services." permission="pastoral:referral:view"
      action={has('pastoral:referral:create') && <button type="button" className={primaryBtn} onClick={() => setAdding(true)}>New referral</button>}>
      <FormSelect label="Status" value={status} placeholder="All" options={selectOptions(REFERRAL_STATUSES)} onChange={(e) => setStatus(e.target.value)} className="max-w-xs" />
      <ApiError error={move.error} />
      <DataState query={list.query} empty="No referrals.">
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead><tr><th className={th}>Date</th><th className={th}>Member</th><th className={th}>Provider</th><th className={th}>Status</th><th className={th} /></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {list.query.data?.items.map((r) => (
                <tr key={r.id}>
                  <td className={td}>{formatDate(r.referralDate)}</td>
                  <td className={td}><Link className="text-primary-600 hover:underline" to={`/pastoral/members/${r.memberId}`}>{memberName(r.member)}</Link></td>
                  <td className={td}>{r.providerName}<span className="block text-xs text-gray-500">{label(r.referralType)}</span></td>
                  <td className={td}><Tag value={r.status} />{r.outcome && <span className="block text-xs text-gray-500">{r.outcome}</span>}</td>
                  <td className={`${td} flex flex-wrap justify-end gap-2`}>
                    {canUpdate && (REFERRAL_NEXT[r.status] ?? []).map((next) => (
                      <button key={next} type="button" className={secondaryBtn} disabled={move.isPending}
                        onClick={() => (next === 'COMPLETED' ? setCompleting(r) : move.mutate({ id: r.id, status: next }))}>{label(next)}</button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={list.page} pageSize={PAGE_SIZE} total={list.query.data?.total ?? 0} onPage={list.setPage} />
      </DataState>
      <Modal open={adding} title="New referral" onClose={() => setAdding(false)}>
        <form onSubmit={submit} className="space-y-3">
          <ApiError error={create.error} />
          <FormField label="Case ID" value={draft.caseId} onChange={(e) => setDraft({ ...draft, caseId: e.target.value })} error={errors.caseId} />
          <FormSelect label="Referral type" value={draft.referralType} options={selectOptions(REFERRAL_TYPES)} onChange={(e) => setDraft({ ...draft, referralType: e.target.value })} />
          <FormField label="Provider" value={draft.providerName} onChange={(e) => setDraft({ ...draft, providerName: e.target.value })} error={errors.providerName} />
          <FormTextarea label="Reason" value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} error={errors.reason} />
          <div className="flex justify-end gap-2"><button type="button" className={secondaryBtn} onClick={() => setAdding(false)}>Cancel</button><button type="submit" className={primaryBtn} disabled={create.isPending}>Create referral</button></div>
        </form>
      </Modal>
      <Modal open={Boolean(completing)} title="Complete referral" onClose={() => setCompleting(null)}>
        <div className="space-y-3">
          <FormTextarea label="Outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)} />
          <div className="flex justify-end gap-2"><button type="button" className={secondaryBtn} onClick={() => setCompleting(null)}>Cancel</button>
            <button type="button" className={primaryBtn} disabled={!outcome.trim() || move.isPending} onClick={() => completing && move.mutate({ id: completing.id, status: 'COMPLETED', outcome: outcome.trim() })}>Mark completed</button></div>
        </div>
      </Modal>
    </Shell>
  );
};
