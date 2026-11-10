import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormField } from '@/components/forms/FormField';
import { FormSelect } from '@/components/forms/FormSelect';
import { FormTextarea } from '@/components/forms/FormTextarea';
import { card, formatDate, primaryBtn } from '@/pages/account/shared';
import { apiClient } from '@/utils/api';
import { ASSESSMENT_DIMENSIONS, type Assessment } from '@/types/pastoral';
import { ApiError, DataState, P, Shell, Tag, selectOptions, td, th, usePagedList, usePermissions } from './pastoralShared';

const DIMS = Object.keys(ASSESSMENT_DIMENSIONS) as Array<keyof typeof ASSESSMENT_DIMENSIONS>;
const initial = () => Object.fromEntries(DIMS.map((d) => [d, ASSESSMENT_DIMENSIONS[d][0]])) as Record<(typeof DIMS)[number], string>;

export const AssessmentsPage = () => {
  const has = usePermissions();
  const queryClient = useQueryClient();
  const [memberInput, setMemberInput] = useState('');
  const [memberId, setMemberId] = useState('');
  const [values, setValues] = useState(initial);
  const [notes, setNotes] = useState('');
  const list = usePagedList<Assessment>('assessments', '/assessments', { memberId }, Boolean(memberId) && has('pastoral:assessment:view'));
  const create = useMutation({
    mutationFn: () => apiClient.post(`${P}/assessments`, { memberId, ...values, ...(notes.trim() && { notes: notes.trim() }) }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['pastoral', 'assessments'] }); setNotes(''); },
  });

  return (
    <Shell title="Wellbeing assessments" subtitle="Each assessment is a dated snapshot; earlier ones are never edited." permission="pastoral:assessment:view">
      <form className="flex max-w-xl items-end gap-2" onSubmit={(e: FormEvent) => { e.preventDefault(); setMemberId(memberInput.trim()); }}>
        <FormField className="flex-1" label="Member ID" value={memberInput} onChange={(e) => setMemberInput(e.target.value)} />
        <button type="submit" className={primaryBtn}>Load history</button>
      </form>
      {memberId && (
        <>
          {has('pastoral:assessment:update') && (
            <form className={`${card} space-y-3`} onSubmit={(e: FormEvent) => { e.preventDefault(); create.mutate(); }}>
              <h2 className="text-lg font-medium">New assessment</h2>
              <ApiError error={create.error} />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {DIMS.map((d) => (
                  <FormSelect key={d} label={d.charAt(0).toUpperCase() + d.slice(1)} value={values[d]} options={selectOptions(ASSESSMENT_DIMENSIONS[d])} onChange={(e) => setValues({ ...values, [d]: e.target.value })} />
                ))}
              </div>
              <FormTextarea label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
              <button type="submit" className={primaryBtn} disabled={create.isPending}>Save assessment</button>
            </form>
          )}
          <DataState query={list.query} empty="No assessments for this member.">
            <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
              <table className="min-w-full divide-y divide-gray-200">
                <thead><tr><th className={th}>Date</th>{DIMS.map((d) => <th key={d} className={th}>{d}</th>)}</tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {list.query.data?.items.map((a) => (
                    <tr key={a.id}><td className={td}>{formatDate(a.assessedAt)}</td>{DIMS.map((d) => <td key={d} className={td}><Tag value={a[d]} /></td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DataState>
        </>
      )}
    </Shell>
  );
};
