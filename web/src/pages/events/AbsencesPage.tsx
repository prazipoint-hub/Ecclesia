import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormField } from '@/components/forms/FormField';
import { FormSelect } from '@/components/forms/FormSelect';
import { FormTextarea } from '@/components/forms/FormTextarea';
import { Modal } from '@/components/forms/Modal';
import { Pagination, card, formatDate, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { apiClient } from '@/utils/api';
import { nextAbsenceStatuses } from '@/types/events';
import type { Absence, DetectResult } from '@/types/events';
import { ApiError, DataState, E, PAGE_SIZE, Shell, Tag, label, personName, td, th, usePagedList, usePermissions } from './eventsShared';

const STATUSES = ['OPEN', 'CONTACTED', 'RESOLVED', 'DISMISSED'];
const CLOSING = ['RESOLVED', 'DISMISSED'];

export const AbsencesPage = () => {
  const has = usePermissions();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const [detect, setDetect] = useState({ eventType: 'SERVICE', threshold: '3' });
  const [preview, setPreview] = useState<DetectResult | null>(null);
  const [closing, setClosing] = useState<{ absence: Absence; next: 'CONTACTED' | 'RESOLVED' | 'DISMISSED' } | null>(null);
  const [notes, setNotes] = useState('');
  const [notesError, setNotesError] = useState('');
  const [assigning, setAssigning] = useState<Absence | null>(null);
  const [assignee, setAssignee] = useState('');
  const list = usePagedList<Absence>('absences', '/absences', { status }, has('absence:followup:manage'));
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['events', 'absences'] });

  const run = useMutation({
    mutationFn: async (dryRun: boolean) => (await apiClient.post<DetectResult>(`${E}/absences/detect`, { eventType: detect.eventType.trim() || 'SERVICE', threshold: Number(detect.threshold), dryRun })).data,
    onSuccess: (data, dryRun) => { if (dryRun) setPreview(data); else { setPreview(null); refresh(); } },
  });
  const update = useMutation({
    mutationFn: ({ id, next, text }: { id: string; next: string; text: string }) => apiClient.put(`${E}/absences/${id}`, { status: next, ...(text ? { notes: text } : {}) }),
    onSuccess: () => { refresh(); setClosing(null); setNotes(''); },
  });
  const assign = useMutation({
    mutationFn: ({ id, to }: { id: string; to: string }) => apiClient.put(`${E}/absences/${id}/assign`, { assignedTo: to }),
    onSuccess: () => { refresh(); setAssigning(null); setAssignee(''); },
  });

  const start = (absence: Absence, next: 'CONTACTED' | 'RESOLVED' | 'DISMISSED') => {
    setNotes(''); setNotesError('');
    setClosing({ absence, next });
  };
  const submitStatus = (e: FormEvent) => {
    e.preventDefault();
    if (!closing) return;
    if (CLOSING.includes(closing.next) && !notes.trim()) { setNotesError('Say what happened before closing this follow-up.'); return; }
    update.mutate({ id: closing.absence.id, next: closing.next, text: notes.trim() });
  };
  const threshold = Number(detect.threshold);
  const thresholdValid = Number.isInteger(threshold) && threshold >= 2 && threshold <= 12;

  return (
    <Shell title="Absence follow-up" subtitle="Members who have stopped coming." permission="absence:followup:manage">
      <section className={`${card} space-y-3`}>
        <h2 className="font-medium text-gray-900">Find members who have been away</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Event type" value={detect.eventType} onChange={(e) => setDetect({ ...detect, eventType: e.target.value.toUpperCase() })} />
          <FormField label="Missed in a row (2–12)" type="number" min={2} max={12} value={detect.threshold} onChange={(e) => setDetect({ ...detect, threshold: e.target.value })} error={thresholdValid ? undefined : 'Choose a number from 2 to 12.'} />
        </div>
        <div className="flex gap-2">
          <button type="button" className={secondaryBtn} disabled={!thresholdValid || run.isPending} onClick={() => run.mutate(true)}>Preview</button>
          {preview && preview.candidates.length > 0 && <button type="button" className={primaryBtn} disabled={run.isPending} onClick={() => run.mutate(false)}>Create {preview.candidates.length} follow-ups</button>}
        </div>
        <ApiError error={run.error} />
        {preview && (
          <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
            {preview.message ?? `${preview.candidates.length} member(s) would be flagged, from the last ${preview.eventsConsidered} events.`}
            {preview.candidates.length > 0 && <ul className="mt-2 list-disc pl-5">{preview.candidates.map((m) => <li key={m.id}>{personName(m)}{m.membershipNumber ? ` (${m.membershipNumber})` : ''}</li>)}</ul>}
          </div>
        )}
        {run.data && !preview && <p role="status" className="text-sm text-green-700">{run.data.created} follow-up(s) created.</p>}
      </section>

      <FormSelect label="Show" value={status} placeholder="All" options={STATUSES.map((s) => ({ value: s, label: label(s) }))} onChange={(e) => setStatus(e.target.value)} className="max-w-xs" />
      <ApiError error={update.error ?? assign.error} />
      <DataState query={list.query} empty="No absence follow-ups.">
        <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead><tr><th className={th}>Member</th><th className={th}>Missed</th><th className={th}>Detected</th><th className={th}>Assigned to</th><th className={th}>Status</th><th className={th} /></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {list.query.data?.items.map((a) => (
                <tr key={a.id}>
                  <td className={td}>{personName(a.member)}</td>
                  <td className={td}>{a.consecutiveAbsences} × {label(a.eventType)}</td>
                  <td className={td}>{formatDate(a.detectedAt)}</td>
                  <td className={td}>{a.assignedTo ?? '—'}</td>
                  <td className={td}><Tag value={a.status} />{a.notes && <div className="mt-1 text-xs text-gray-500">{a.notes}</div>}</td>
                  <td className={`${td} text-right`}>
                    <span className="flex flex-wrap justify-end gap-2">
                      {(a.status === 'OPEN' || a.status === 'CONTACTED') && <button type="button" className={secondaryBtn} onClick={() => { setAssignee(''); setAssigning(a); }}>Assign</button>}
                      {nextAbsenceStatuses(a.status).map((next) => <button key={next} type="button" className={secondaryBtn} onClick={() => start(a, next)}>{label(next)}</button>)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={list.page} pageSize={PAGE_SIZE} total={list.query.data?.total ?? 0} onPage={list.setPage} />
      </DataState>

      <Modal open={Boolean(closing)} title={closing ? `Mark as ${label(closing.next).toLowerCase()}` : ''} onClose={() => setClosing(null)}>
        <form onSubmit={submitStatus} className="space-y-3">
          <FormTextarea label="Notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} error={notesError || undefined} />
          <div className="flex justify-end gap-2"><button type="button" className={secondaryBtn} onClick={() => setClosing(null)}>Cancel</button><button type="submit" className={primaryBtn} disabled={update.isPending}>Save</button></div>
        </form>
      </Modal>
      <Modal open={Boolean(assigning)} title="Assign follow-up" onClose={() => setAssigning(null)}>
        <form onSubmit={(e) => { e.preventDefault(); if (assigning && assignee.trim()) assign.mutate({ id: assigning.id, to: assignee.trim() }); }} className="space-y-3">
          <FormField label="Member ID of the person responsible" value={assignee} onChange={(e) => setAssignee(e.target.value)} />
          <div className="flex justify-end gap-2"><button type="button" className={secondaryBtn} onClick={() => setAssigning(null)}>Cancel</button><button type="submit" className={primaryBtn} disabled={assign.isPending || !assignee.trim()}>Assign</button></div>
        </form>
      </Modal>
    </Shell>
  );
};
