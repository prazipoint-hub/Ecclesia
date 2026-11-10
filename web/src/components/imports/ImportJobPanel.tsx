import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyBlock, ErrorBlock, LoadingBlock, card, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import { download } from '@/pages/members/peopleShared';

/**
 * Staged import: upload -> review problems -> decide ambiguous rows -> confirm. Nothing is written until confirm, and the
 * server re-validates every row at confirm. Works for any job API with the shared shape (members, leadership).
 */
export interface JobSummary { id: string; fileName: string; status: string; counts: { totalRows: number; imported: number; skipped: number; rejected: number; failed: number; awaitingDecision: number; readyToImport: number }; reconciles: boolean; remaining: number; reused?: boolean }
interface Match { memberId: string; name?: string; membershipNumber?: string; why?: string }
interface Row { rowNumber: number; status: string; reason: string | null; decision: string | null; original: Record<string, string>; errors: string[]; warnings: string[]; matches: Match[] }

const MAX_BYTES = 5 * 1024 * 1024;
const readText = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result ?? '')); r.onerror = () => rej(new Error('The file could not be read.')); r.readAsText(f); });
const CSV = { headers: { 'Content-Type': 'text/csv' } };

export const ImportJobPanel = ({ base, templateUrl, templateName, kind }: { base: string; templateUrl: string; templateName: string; kind: 'MEMBER' | 'LEADERSHIP' }) => {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [skipUnresolved, setSkipUnresolved] = useState(false);
  const [filter, setFilter] = useState<'REVIEW' | 'REJECTED' | 'VALID'>('REVIEW');
  const key = ['import', base, jobId];

  const job = useQuery({ queryKey: key, enabled: !!jobId, queryFn: async () => (await apiClient.get<JobSummary>(`${base}/${jobId}`)).data });
  const rows = useQuery({ queryKey: [...key, 'rows', filter], enabled: !!jobId, queryFn: async () => (await apiClient.get<{ total: number; rows: Row[] }>(`${base}/${jobId}/rows`, { params: { status: filter, pageSize: 100 } })).data });
  const refresh = () => void qc.invalidateQueries({ queryKey: key });

  const stage = useMutation({
    mutationFn: async (f: { name: string; text: string }) => (await apiClient.post<JobSummary>(base, f.text, { ...CSV, params: { fileName: f.name } })).data,
    onSuccess: (s) => setJobId(s.id),
  });
  const decide = useMutation({ mutationFn: (d: { row: number; decision: string }) => apiClient.put(`${base}/${jobId}/decisions`, { decisions: [d] }), onSuccess: refresh });
  const confirm = useMutation({ mutationFn: () => apiClient.post<JobSummary>(`${base}/${jobId}/confirm`, { skipUnresolved }), onSuccess: refresh });
  const cancel = useMutation({ mutationFn: () => apiClient.post(`${base}/${jobId}/cancel`), onSuccess: () => { setJobId(null); } });

  const pick = async (file: File | undefined) => {
    setFileError(null);
    if (!file) return;
    if (file.size > MAX_BYTES) { setFileError('The file is larger than 5 MB.'); return; }
    if (!/\.csv$/i.test(file.name)) { setFileError('Choose a .csv file.'); return; }
    try { stage.mutate({ name: file.name, text: await readText(file) }); } catch (e) { setFileError((e as Error).message); }
  };
  const fetchCsv = async (url: string, name: string) => download(new Blob([(await apiClient.get<string>(url, { responseType: 'text' })).data], { type: 'text/csv' }), name);
  const s = job.data;
  const open = s && !['COMPLETED', 'CANCELLED'].includes(s.status);

  return (
    <div className="space-y-4">
      <section className={card}>
        <h2 className="mb-2 text-lg font-medium text-gray-900">1. Choose a file</h2>
        <p className="mb-3 text-sm text-gray-600">Nothing is saved until you confirm. Start from the template so the columns match.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondaryBtn} onClick={() => void fetchCsv(templateUrl, templateName).catch(() => undefined)}>Download template</button>
          <button type="button" className={primaryBtn} disabled={stage.isPending} onClick={() => input.current?.click()}>{stage.isPending ? 'Checking…' : 'Upload CSV'}</button>
          <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" aria-label="CSV file" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {fileError && <ErrorNotice message={fileError} />}
        {stage.error && <ErrorNotice message={getApiErrorMessage(stage.error)} />}
        {stage.data?.reused && <p className="mt-2 text-sm text-gray-600">This exact file was uploaded before, so its existing import is shown.</p>}
      </section>

      {jobId && (job.isLoading ? <LoadingBlock /> : job.error || !s ? <ErrorBlock error={job.error} /> : (
        <>
          <section className={card} aria-label="Import summary">
            <h2 className="mb-2 text-lg font-medium text-gray-900">2. Review: {s.fileName} <span className="text-sm font-normal text-gray-500">({s.status.toLowerCase()})</span></h2>
            <dl className="grid gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
              {([['Rows', s.counts.totalRows], ['Ready', s.counts.readyToImport], ['Need a decision', s.counts.awaitingDecision], ['Rejected', s.counts.rejected], ['Imported', s.counts.imported], ['Skipped', s.counts.skipped]] as const).map(([l, v]) => <div key={l}><dt className="text-gray-500">{l}</dt><dd className="text-lg font-medium tabular-nums">{v}</dd></div>)}
            </dl>
            {!s.reconciles && <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">These counts do not add up to the number of rows. Do not rely on this import; contact support.</p>}
            {s.counts.rejected > 0 && <button type="button" className={`${secondaryBtn} mt-3`} onClick={() => void fetchCsv(`${base}/${jobId}/problems.csv`, 'import-problems.csv').catch(() => undefined)}>Download rejected rows to fix</button>}
          </section>

          <section className={card} aria-label="Rows">
            <div className="mb-3 flex gap-1" role="tablist">
              {(['REVIEW', 'REJECTED', 'VALID'] as const).map((f) => <button key={f} role="tab" aria-selected={filter === f} type="button" onClick={() => setFilter(f)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filter === f ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100'}`}>{f === 'REVIEW' ? 'Need a decision' : f === 'REJECTED' ? 'Rejected' : 'Ready'}</button>)}
            </div>
            {decide.error && <ErrorNotice message={getApiErrorMessage(decide.error)} />}
            {rows.isLoading ? <LoadingBlock /> : !rows.data?.rows.length ? <EmptyBlock message="No rows here." /> : (
              <ul className="divide-y text-sm">
                {rows.data.rows.map((r) => (
                  <li key={r.rowNumber} className="py-2">
                    <p className="font-medium text-gray-900">Row {r.rowNumber}: {Object.values(r.original).filter(Boolean).slice(0, 4).join(' · ')}</p>
                    {r.errors.length > 0 && <p className="text-red-700">{r.errors.join('; ')}</p>}
                    {r.warnings.length > 0 && <p className="text-amber-700">{r.warnings.join('; ')}</p>}
                    {r.status === 'REVIEW' && open && (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-gray-600">{r.reason === 'AMBIGUOUS_PERSON' ? 'Which person is this?' : 'Possible match with an existing person.'}</span>
                        {kind === 'LEADERSHIP' && r.matches.map((m) => <button key={m.memberId} type="button" className={secondaryBtn} disabled={decide.isPending} onClick={() => decide.mutate({ row: r.rowNumber, decision: `USE:${m.memberId}` })}>Use {m.name ?? m.memberId} {m.membershipNumber ?? ''}</button>)}
                        {kind === 'MEMBER' && <button type="button" className={secondaryBtn} disabled={decide.isPending} onClick={() => decide.mutate({ row: r.rowNumber, decision: 'CREATE' })}>Create as new</button>}
                        <button type="button" className={secondaryBtn} disabled={decide.isPending} onClick={() => decide.mutate({ row: r.rowNumber, decision: 'SKIP' })}>Skip</button>
                        {r.decision && <span className="text-xs text-green-700">Chosen: {r.decision.startsWith('USE:') ? 'use existing' : r.decision.toLowerCase()}</span>}
                      </div>
                    )}
                    {r.status === 'REVIEW' && r.matches.length > 0 && kind === 'MEMBER' && <p className="text-xs text-gray-500">Existing: {r.matches.map((m) => `${m.name ?? ''} ${m.membershipNumber ?? ''}`.trim()).join(', ')}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {open && (
            <section className={card} aria-label="Confirm">
              <h2 className="mb-2 text-lg font-medium text-gray-900">3. Confirm</h2>
              {confirm.error && <ErrorNotice message={getApiErrorMessage(confirm.error)} />}
              {s.counts.awaitingDecision > 0 && (
                <label className="mb-2 flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={skipUnresolved} onChange={(e) => setSkipUnresolved(e.target.checked)} />
                  Skip the {s.counts.awaitingDecision} row(s) that still need a decision
                </label>
              )}
              <div className="flex gap-2">
                <button type="button" className={primaryBtn} disabled={confirm.isPending || s.counts.readyToImport === 0 || (s.counts.awaitingDecision > 0 && !skipUnresolved)} onClick={() => confirm.mutate()}>{confirm.isPending ? 'Importing…' : `Import ${s.counts.readyToImport} row(s)`}</button>
                <button type="button" className={secondaryBtn} disabled={cancel.isPending} onClick={() => cancel.mutate()}>Cancel this import</button>
              </div>
              {s.remaining > 0 && s.status === 'PARTIAL' && <p className="mt-2 text-sm text-amber-800">{s.remaining} row(s) remain. Confirm again to continue; rows already imported are not repeated.</p>}
            </section>
          )}
          {s.status === 'COMPLETED' && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">Import finished: {s.counts.imported} imported, {s.counts.skipped} skipped, {s.counts.rejected} rejected.</p>}
        </>
      ))}
    </div>
  );
};
