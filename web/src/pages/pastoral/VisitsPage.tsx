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
import { VISIT_OUTCOMES, VISIT_TYPES, type Visit } from '@/types/pastoral';
import { ApiError, DataState, P, PAGE_SIZE, Shell, Tag, label, memberName, selectOptions, td, th, today, usePagedList, usePermissions } from './pastoralShared';

const EMPTY = { memberId: '', caseId: '', visitType: 'GENERAL_PASTORAL', visitDate: today(), location: '', purpose: '', observations: '', outcome: 'NO_FURTHER_ACTION', followUpRequired: false, followUpDate: '' };

export const VisitsPage = () => {
  const has = usePermissions();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const list = usePagedList<Visit>('visits', '/visits', {}, has('pastoral:visit:view'));
  const create = useMutation({
    mutationFn: () => apiClient.post(`${P}/visits`, {
      memberId: draft.memberId.trim(), visitType: draft.visitType, visitDate: draft.visitDate, outcome: draft.outcome,
      purpose: draft.purpose.trim(), observations: draft.observations.trim(), followUpRequired: draft.followUpRequired,
      ...(draft.caseId.trim() && { caseId: draft.caseId.trim() }),
      ...(draft.location.trim() && { location: draft.location.trim() }),
      ...(draft.followUpRequired && draft.followUpDate && { followUpDate: draft.followUpDate }),
    }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['pastoral', 'visits'] }); setAdding(false); setDraft(EMPTY); },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!draft.memberId.trim()) next.memberId = 'Enter the member ID.';
    if (draft.purpose.trim().length < 10) next.purpose = 'Purpose needs at least 10 characters.';
    if (draft.observations.trim().length < 20) next.observations = 'Observations need at least 20 characters.';
    if (draft.followUpRequired && !draft.followUpDate) next.followUpDate = 'Set a follow-up date.';
    setErrors(next);
    if (Object.keys(next).length === 0) create.mutate();
  };
  const set = (patch: Partial<typeof EMPTY>) => setDraft({ ...draft, ...patch });

  return (
    <Shell title="Pastoral visits" subtitle="Home, hospital and other pastoral visits." permission="pastoral:visit:view"
      action={has('pastoral:visit:create') && <button type="button" className={primaryBtn} onClick={() => setAdding(true)}>Record visit</button>}>
      <DataState query={list.query} empty="No visits recorded yet.">
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead><tr><th className={th}>Date</th><th className={th}>Member</th><th className={th}>Type</th><th className={th}>Outcome</th><th className={th}>Follow-up</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {list.query.data?.items.map((v) => (
                <tr key={v.id}>
                  <td className={td}>{formatDate(v.visitDate)}</td>
                  <td className={td}><Link className="text-primary-600 hover:underline" to={`/pastoral/members/${v.memberId}`}>{memberName(v.member)}</Link></td>
                  <td className={td}>{label(v.visitType)}</td><td className={td}><Tag value={v.outcome} /></td>
                  <td className={td}>{v.followUpRequired ? formatDate(v.followUpDate) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={list.page} pageSize={PAGE_SIZE} total={list.query.data?.total ?? 0} onPage={list.setPage} />
      </DataState>
      <Modal open={adding} title="Record visit" onClose={() => setAdding(false)}>
        <form onSubmit={submit} className="space-y-3">
          <ApiError error={create.error} />
          <FormField label="Member ID" value={draft.memberId} onChange={(e) => set({ memberId: e.target.value })} error={errors.memberId} />
          <FormField label="Case ID (optional)" value={draft.caseId} onChange={(e) => set({ caseId: e.target.value })} />
          <FormSelect label="Visit type" value={draft.visitType} options={selectOptions(VISIT_TYPES)} onChange={(e) => set({ visitType: e.target.value })} />
          <FormField label="Visit date" type="date" value={draft.visitDate} onChange={(e) => set({ visitDate: e.target.value })} />
          <FormField label="Location (optional)" value={draft.location} onChange={(e) => set({ location: e.target.value })} />
          <FormTextarea label="Purpose" value={draft.purpose} onChange={(e) => set({ purpose: e.target.value })} error={errors.purpose} />
          <FormTextarea label="Observations" value={draft.observations} onChange={(e) => set({ observations: e.target.value })} error={errors.observations} />
          <FormSelect label="Outcome" value={draft.outcome} options={selectOptions(VISIT_OUTCOMES)} onChange={(e) => set({ outcome: e.target.value })} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.followUpRequired} onChange={(e) => set({ followUpRequired: e.target.checked })} /> Follow-up required</label>
          {draft.followUpRequired && <FormField label="Follow-up date" type="date" value={draft.followUpDate} onChange={(e) => set({ followUpDate: e.target.value })} error={errors.followUpDate} />}
          <div className="flex justify-end gap-2"><button type="button" className={secondaryBtn} onClick={() => setAdding(false)}>Cancel</button><button type="submit" className={primaryBtn} disabled={create.isPending}>Save visit</button></div>
        </form>
      </Modal>
    </Shell>
  );
};
