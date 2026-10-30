import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormField } from '@/components/forms/FormField';
import { FormSelect } from '@/components/forms/FormSelect';
import { FormTextarea } from '@/components/forms/FormTextarea';
import { Modal } from '@/components/forms/Modal';
import { LoadingBlock, Pagination, formatDate, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { apiClient } from '@/utils/api';
import { COUNSELING_OUTCOMES, COUNSELING_TYPES, type Counseling } from '@/types/pastoral';
import { ApiError, DataState, P, PAGE_SIZE, Shell, Tag, label, memberName, selectOptions, td, th, today, usePagedList, usePermissions } from './pastoralShared';

const CONFIDENTIAL = 'pastoral:counseling:confidential';
const EMPTY = { memberId: '', caseId: '', counselingType: 'SPIRITUAL', concern: '', intervention: '', outcome: 'ONGOING', sessionDate: today(), confidentialNotes: '', followUpPlan: '' };

const Detail = ({ id, onClose }: { id: string; onClose: () => void }) => {
  const has = usePermissions();
  // Opening a session is what the server audits when confidential content is released.
  const session = useQuery({ queryKey: ['pastoral', 'counseling', id], queryFn: async () => (await apiClient.get<Counseling>(`${P}/counseling/${id}`)).data });
  const s = session.data;
  return (
    <Modal open title="Counseling session" onClose={onClose}>
      {session.isLoading ? <LoadingBlock /> : <ApiError error={session.error} />}
      {s && (
        <div className="space-y-3 text-sm">
          <p><strong>{memberName(s.member)}</strong> · {label(s.counselingType)} · {formatDate(s.sessionDate)}</p>
          <p><span className="font-medium">Concern:</span> {s.concern}</p>
          {s.intervention && <p><span className="font-medium">Intervention:</span> {s.intervention}</p>}
          <p><span className="font-medium">Outcome:</span> {label(s.outcome)}</p>
          {s.confidentialNotes != null && <div><p className="font-medium">Confidential notes</p><p className="whitespace-pre-wrap rounded bg-amber-50 p-2">{s.confidentialNotes}</p></div>}
          {s.followUpPlan != null && <div><p className="font-medium">Follow-up plan</p><p className="whitespace-pre-wrap rounded bg-amber-50 p-2">{s.followUpPlan}</p></div>}
          {s.hasConfidentialContent && s.confidentialNotes === undefined && s.followUpPlan === undefined && (
            <p className="text-gray-500">This session has confidential notes that you do not have access to.</p>
          )}
          {has(CONFIDENTIAL) && s.hasConfidentialContent && <p className="text-xs text-gray-500">Opening confidential notes is recorded in the audit log.</p>}
        </div>
      )}
    </Modal>
  );
};

export const CounselingPage = () => {
  const has = usePermissions();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const list = usePagedList<Counseling>('counseling', '/counseling', {}, has('pastoral:counseling:view'));
  const canSeeConfidential = has(CONFIDENTIAL);
  const create = useMutation({
    mutationFn: () => apiClient.post(`${P}/counseling`, {
      memberId: draft.memberId.trim(), counselingType: draft.counselingType, concern: draft.concern.trim(), outcome: draft.outcome, sessionDate: draft.sessionDate,
      ...(draft.caseId.trim() && { caseId: draft.caseId.trim() }),
      ...(draft.intervention.trim() && { intervention: draft.intervention.trim() }),
      ...(canSeeConfidential && draft.confidentialNotes.trim() && { confidentialNotes: draft.confidentialNotes.trim() }),
      ...(canSeeConfidential && draft.followUpPlan.trim() && { followUpPlan: draft.followUpPlan.trim() }),
    }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['pastoral', 'counseling'] }); setAdding(false); setDraft(EMPTY); },
  });
  const set = (patch: Partial<typeof EMPTY>) => setDraft({ ...draft, ...patch });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!draft.memberId.trim()) next.memberId = 'Enter the member ID.';
    if (draft.concern.trim().length < 10) next.concern = 'Describe the concern (10+ characters).';
    setErrors(next);
    if (Object.keys(next).length === 0) create.mutate();
  };

  return (
    <Shell title="Counseling" subtitle="Session records. Confidential notes are shown only to authorised counselors." permission="pastoral:counseling:view"
      action={has('pastoral:counseling:create') && <button type="button" className={primaryBtn} onClick={() => setAdding(true)}>Record session</button>}>
      <DataState query={list.query} empty="No counseling sessions yet.">
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead><tr><th className={th}>Date</th><th className={th}>Member</th><th className={th}>Type</th><th className={th}>Outcome</th><th className={th} /></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {list.query.data?.items.map((c) => (
                <tr key={c.id}>
                  <td className={td}>{formatDate(c.sessionDate)}</td>
                  <td className={td}><Link className="text-primary-600 hover:underline" to={`/pastoral/members/${c.memberId}`}>{memberName(c.member)}</Link></td>
                  <td className={td}>{label(c.counselingType)}</td>
                  <td className={td}><Tag value={c.outcome} />{c.hasConfidentialContent && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Has confidential notes</span>}</td>
                  <td className={`${td} text-right`}><button type="button" className="font-medium text-primary-600 hover:underline" onClick={() => setOpenId(c.id)} aria-label={`Open session ${formatDate(c.sessionDate)}`}>Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={list.page} pageSize={PAGE_SIZE} total={list.query.data?.total ?? 0} onPage={list.setPage} />
      </DataState>
      {openId && <Detail id={openId} onClose={() => setOpenId(null)} />}
      <Modal open={adding} title="Record counseling session" onClose={() => setAdding(false)}>
        <form onSubmit={submit} className="space-y-3">
          <ApiError error={create.error} />
          <FormField label="Member ID" value={draft.memberId} onChange={(e) => set({ memberId: e.target.value })} error={errors.memberId} />
          <FormField label="Case ID (optional)" value={draft.caseId} onChange={(e) => set({ caseId: e.target.value })} />
          <FormSelect label="Counseling type" value={draft.counselingType} options={selectOptions(COUNSELING_TYPES)} onChange={(e) => set({ counselingType: e.target.value })} />
          <FormField label="Session date" type="date" value={draft.sessionDate} onChange={(e) => set({ sessionDate: e.target.value })} />
          <FormTextarea label="Concern" value={draft.concern} onChange={(e) => set({ concern: e.target.value })} error={errors.concern} />
          <FormTextarea label="Intervention (optional)" value={draft.intervention} onChange={(e) => set({ intervention: e.target.value })} />
          <FormSelect label="Outcome" value={draft.outcome} options={selectOptions(COUNSELING_OUTCOMES)} onChange={(e) => set({ outcome: e.target.value })} />
          {canSeeConfidential && (
            <>
              <FormTextarea label="Confidential notes" value={draft.confidentialNotes} onChange={(e) => set({ confidentialNotes: e.target.value })} />
              <FormTextarea label="Follow-up plan (confidential)" value={draft.followUpPlan} onChange={(e) => set({ followUpPlan: e.target.value })} />
              <p className="text-xs text-gray-500">Reading confidential notes later is recorded in the audit log.</p>
            </>
          )}
          <div className="flex justify-end gap-2"><button type="button" className={secondaryBtn} onClick={() => setAdding(false)}>Cancel</button><button type="submit" className={primaryBtn} disabled={create.isPending}>Save session</button></div>
        </form>
      </Modal>
    </Shell>
  );
};
