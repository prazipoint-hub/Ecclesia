import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormField } from '@/components/forms/FormField';
import { FormSelect } from '@/components/forms/FormSelect';
import { Modal } from '@/components/forms/Modal';
import { Pagination, formatDate, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { apiClient } from '@/utils/api';
import type { FollowUp } from '@/types/pastoral';
import { ApiError, DataState, P, PAGE_SIZE, Shell, Tag, memberName, td, th, today, usePagedList, usePermissions } from './pastoralShared';

const FILTERS = [{ value: 'OVERDUE', label: 'Overdue' }, { value: 'PENDING', label: 'Upcoming' }, { value: 'COMPLETED', label: 'Completed' }, { value: 'CANCELLED', label: 'Cancelled' }];
const EMPTY = { caseId: '', dueDate: today(), reason: '' };

export const FollowUpsPage = () => {
  const has = usePermissions();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const list = usePagedList<FollowUp>('followups', '/followups', { status }, has('pastoral:followup:view'));
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['pastoral', 'followups'] });
  const create = useMutation({
    mutationFn: () => apiClient.post(`${P}/followups`, { caseId: draft.caseId.trim(), dueDate: draft.dueDate, reason: draft.reason.trim() }),
    onSuccess: () => { refresh(); setAdding(false); setDraft(EMPTY); },
  });
  const finish = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'complete' | 'cancel' }) => apiClient.post(`${P}/followups/${id}/${action}`, {}),
    onSuccess: refresh,
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!draft.caseId.trim()) next.caseId = 'Enter the case ID.';
    if (!draft.dueDate || draft.dueDate < today()) next.dueDate = 'Pick today or a later date.';
    if (draft.reason.trim().length < 5) next.reason = 'Give a reason (5+ characters).';
    setErrors(next);
    if (Object.keys(next).length === 0) create.mutate();
  };
  const canManage = has('pastoral:followup:manage');

  return (
    <Shell title="Follow-ups" subtitle="Care that has been promised and is still due." permission="pastoral:followup:view"
      action={canManage && <button type="button" className={primaryBtn} onClick={() => setAdding(true)}>New follow-up</button>}>
      <FormSelect label="Show" value={status} placeholder="All" options={FILTERS} onChange={(e) => setStatus(e.target.value)} className="max-w-xs" />
      <ApiError error={finish.error} />
      <DataState query={list.query} empty="No follow-ups.">
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead><tr><th className={th}>Due</th><th className={th}>Member</th><th className={th}>Reason</th><th className={th}>Status</th><th className={th} /></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {list.query.data?.items.map((f) => (
                <tr key={f.id}>
                  <td className={td}>{formatDate(f.dueDate)}</td>
                  <td className={td}><Link className="text-primary-600 hover:underline" to={`/pastoral/members/${f.memberId}`}>{memberName(f.member)}</Link></td>
                  <td className={td}>{f.reason}</td>
                  <td className={td}><Tag value={f.effectiveStatus} /></td>
                  <td className={`${td} text-right`}>
                    {canManage && (f.status === 'PENDING' || f.status === 'OVERDUE') && (
                      <span className="flex justify-end gap-2">
                        <button type="button" className={secondaryBtn} disabled={finish.isPending} onClick={() => finish.mutate({ id: f.id, action: 'complete' })}>Complete</button>
                        <button type="button" className={secondaryBtn} disabled={finish.isPending} onClick={() => finish.mutate({ id: f.id, action: 'cancel' })}>Cancel</button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={list.page} pageSize={PAGE_SIZE} total={list.query.data?.total ?? 0} onPage={list.setPage} />
      </DataState>
      <Modal open={adding} title="New follow-up" onClose={() => setAdding(false)}>
        <form onSubmit={submit} className="space-y-3">
          <ApiError error={create.error} />
          <FormField label="Case ID" value={draft.caseId} onChange={(e) => setDraft({ ...draft, caseId: e.target.value })} error={errors.caseId} />
          <FormField label="Due date" type="date" min={today()} value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} error={errors.dueDate} />
          <FormField label="Reason" value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} error={errors.reason} />
          <div className="flex justify-end gap-2"><button type="button" className={secondaryBtn} onClick={() => setAdding(false)}>Cancel</button><button type="submit" className={primaryBtn} disabled={create.isPending}>Create</button></div>
        </form>
      </Modal>
    </Shell>
  );
};
