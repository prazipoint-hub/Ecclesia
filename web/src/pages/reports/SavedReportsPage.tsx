import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/forms/Modal';
import { EmptyBlock, ErrorBlock, LoadingBlock, Pagination, card, formatDate, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { useAuthStore } from '@stores/authStore';
import type { Execution, Paged, RunOutcome, SavedReport } from '@/types/reports';
import { apiClient } from '@/utils/api';
import { ApiError, JsonPreview, R, Shell, Tag, bytes, dateTime, label, runReport, td, th, usePermissions } from './reportsShared';
import { SaveReportForm } from './SaveReportForm';
import type { SaveValues } from './SaveReportForm';

const PAGE = 25;
const FAILURE_LIMIT = 5;

/** Plain-language state of the schedule, including why it might have stopped. */
export const scheduleNote = (r: SavedReport): string | null => {
  if (r.schedule === 'NONE') return null;
  if (!r.isActive) return r.failureCount >= FAILURE_LIMIT ? 'Switched off after repeated failures. Fix the cause, then resume.' : 'Paused: the schedule is not running.';
  if (r.failureCount > 0) return `${r.failureCount} scheduled run${r.failureCount === 1 ? '' : 's'} failed in a row.`;
  return null;
};

export const SavedReportsPage = () => {
  const has = usePermissions();
  const userId = useAuthStore((s) => s.user?.id);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<SavedReport | null>(null);
  const [deleting, setDeleting] = useState<SavedReport | null>(null);
  const [historyFor, setHistoryFor] = useState<string>('');
  const [page, setPage] = useState(1);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [sweep, setSweep] = useState<{ ran: number; failed: number } | null>(null);

  const list = useQuery({ queryKey: ['reports', 'saved'], queryFn: async () => (await apiClient.get<SavedReport[]>(`${R}/saved`)).data });
  const executions = useQuery({
    queryKey: ['reports', 'executions', historyFor, page],
    queryFn: async () => (await apiClient.get<Paged<Execution>>(`${R}/executions`, { params: { ...(historyFor ? { reportId: historyFor } : {}), skip: (page - 1) * PAGE, take: PAGE } })).data,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['reports', 'saved'] });
    void queryClient.invalidateQueries({ queryKey: ['reports', 'executions'] });
  };

  const canChange = (r: SavedReport) => r.createdBy === userId || has('report:saved:manage_all');

  const runNow = useMutation({
    mutationFn: (r: SavedReport) => runReport('post', `${R}/saved/${r.id}/run`),
    onSuccess: (result) => { setOutcome(result); refresh(); },
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => apiClient.put(`${R}/saved/${id}`, body),
    onSuccess: () => { setEditing(null); refresh(); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiClient.delete(`${R}/saved/${id}`),
    onSuccess: (_d, id) => { setDeleting(null); if (historyFor === id) setHistoryFor(''); refresh(); },
  });
  const runDue = useMutation({
    mutationFn: async () => (await apiClient.post<{ ran: number; failed: number }>(`${R}/saved/run-due`)).data,
    onSuccess: (data) => { setSweep(data); refresh(); },
  });

  const save = (values: SaveValues) => editing && update.mutate({ id: editing.id, body: { ...values } });

  return (
    <Shell
      title="Saved reports"
      subtitle="Reports you saved, and shared ones you can run."
      action={has('report:schedule:run') ? <button type="button" className={secondaryBtn} disabled={runDue.isPending} onClick={() => runDue.mutate()}>Run due schedules now</button> : undefined}
    >
      <ApiError error={runNow.error ?? update.error ?? remove.error ?? runDue.error} />
      {sweep && <p role="status" className="text-sm text-green-700">Schedules run: {sweep.ran} succeeded, {sweep.failed} failed.</p>}
      {outcome?.kind === 'file' && <p role="status" className="text-sm text-green-700">Downloaded {outcome.filename}.</p>}
      {outcome?.kind === 'json' && <section className={`${card} space-y-2`}><h2 className="font-medium text-gray-900">{outcome.filename}</h2><JsonPreview data={outcome.data} /></section>}

      {list.isLoading ? <LoadingBlock /> : list.error ? <ErrorBlock error={list.error} onRetry={() => void list.refetch()} /> : (list.data ?? []).length === 0 ? <EmptyBlock message="No saved reports yet. Build a report and choose “Save this report”." /> : (
        <div className="space-y-3">
          {list.data!.map((r) => {
            const note = scheduleNote(r);
            const owner = r.createdBy === userId;
            return (
              <article key={r.id} className={`${card} space-y-2`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-medium text-gray-900">{r.name}</h2>
                    <p className="text-sm text-gray-600">{label(r.reportType)} · {r.format} · {r.visibility === 'CHURCH' ? 'Shared with the church' : 'Private'}{owner ? ' · Yours' : ''}</p>
                    {r.description && <p className="mt-1 text-sm text-gray-500">{r.description}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={primaryBtn} disabled={runNow.isPending} onClick={() => runNow.mutate(r)}>Run now</button>
                    <button type="button" className={secondaryBtn} onClick={() => { setHistoryFor(r.id); setPage(1); }}>History</button>
                    {canChange(r) && (
                      <>
                        <button type="button" className={secondaryBtn} onClick={() => { update.reset(); setEditing(r); }}>Edit</button>
                        {r.schedule !== 'NONE' && <button type="button" className={secondaryBtn} onClick={() => update.mutate({ id: r.id, body: { isActive: !r.isActive } })}>{r.isActive ? 'Pause' : 'Resume'}</button>}
                        <button type="button" className={secondaryBtn} onClick={() => setDeleting(r)}>Delete</button>
                      </>
                    )}
                  </div>
                </div>
                <p className="text-sm text-gray-600">
                  {r.schedule === 'NONE' ? 'Not scheduled' : `${label(r.schedule)} to ${(r.recipients ?? []).length} recipient(s) · next ${dateTime(r.nextRunAt)}`} · last run {dateTime(r.lastRunAt)}
                </p>
                {note && <p role="note" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{note}</p>}
              </article>
            );
          })}
        </div>
      )}

      <section className={`${card} space-y-3`}>
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-gray-900">{historyFor ? 'History of this report' : 'Recent runs'}</h2>
          {historyFor && <button type="button" className={secondaryBtn} onClick={() => { setHistoryFor(''); setPage(1); }}>Show all runs</button>}
        </div>
        {executions.isLoading ? <LoadingBlock /> : executions.error ? <ErrorBlock error={executions.error} onRetry={() => void executions.refetch()} /> : (executions.data?.items.length ?? 0) === 0 ? <EmptyBlock message="No runs yet." /> : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead><tr><th className={th}>When</th><th className={th}>Report</th><th className={th}>How</th><th className={th}>Status</th><th className={th}>Rows</th><th className={th}>Size</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {executions.data!.items.map((x) => (
                    <tr key={x.id}>
                      <td className={td}>{formatDate(x.startedAt)}</td>
                      <td className={td}>{label(x.reportType)} <span className="text-xs text-gray-500">{x.format}</span></td>
                      <td className={td}>{label(x.trigger)}</td>
                      <td className={td}><Tag value={x.status} />{x.error && <div className="mt-1 text-xs text-red-700">{x.error}</div>}</td>
                      <td className={td}>{x.rowCount ?? '—'}</td>
                      <td className={td}>{bytes(x.byteSize)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE} total={executions.data!.total} onPage={setPage} />
          </>
        )}
      </section>

      <Modal open={Boolean(editing)} title="Edit saved report" onClose={() => setEditing(null)}>
        {editing && (
          <SaveReportForm
            key={editing.id}
            initial={{ name: editing.name, description: editing.description, visibility: editing.visibility, schedule: editing.schedule, recipients: editing.recipients, format: editing.format }}
            busy={update.isPending}
            error={update.error}
            submitLabel="Save changes"
            onSubmit={save}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
      <Modal open={Boolean(deleting)} title="Delete saved report" onClose={() => setDeleting(null)}>
        <p className="text-sm text-gray-700">Delete “{deleting?.name}”? Its schedule stops and it disappears for everyone. Past run history is kept.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={secondaryBtn} onClick={() => setDeleting(null)}>Keep it</button>
          <button type="button" className={primaryBtn} disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting.id)}>Delete</button>
        </div>
      </Modal>
    </Shell>
  );
};
