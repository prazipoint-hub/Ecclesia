import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { MainLayout } from '@/components/Layout/MainLayout';
import { EmptyBlock, ErrorBlock, formatDate, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { AdminHeader, NoAccess } from '@/pages/admin/adminShared';
import { ErrorNotice, SuccessNotice } from '@/pages/auth/AuthShell';
import { useAuthStore } from '@stores/authStore';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import { IMPORT_TEMPLATE, MAX_IMPORT_BYTES, can, type ImportHistoryItem, type ImportPreview, type ImportResult } from '@/types/people';
import { BackLink, Badge, TableWrap, Td, Th, download } from './peopleShared';

const CSV = { headers: { 'Content-Type': 'text/csv' } };

const readFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.readAsText(file);
  });

export const MemberImportPage = () => {
  const permissions = useAuthStore((s) => s.user?.permissions);
  const allowed = can(permissions, 'member:import');
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [skipInvalid, setSkipInvalid] = useState(false);

  const history = useQuery({
    queryKey: ['members', 'imports'],
    enabled: allowed,
    queryFn: async () => (await apiClient.get<ImportHistoryItem[]>('/api/v2/members/imports')).data,
  });

  const previewMutation = useMutation({
    mutationFn: async (text: string) => (await apiClient.post<ImportPreview>('/api/v2/members/import/preview', text, CSV)).data,
    onSuccess: (data) => setPreview(data),
  });

  const importMutation = useMutation({
    mutationFn: async () =>
      (await apiClient.post<ImportResult>('/api/v2/members/import', file!.text, { ...CSV, params: { fileName: file!.name, skipInvalid } })).data,
    onSuccess: (data) => {
      setResult(data);
      void queryClient.invalidateQueries({ queryKey: ['members'] });
    },
  });

  const reset = () => {
    setPreview(null);
    setResult(null);
    setSkipInvalid(false);
    previewMutation.reset();
    importMutation.reset();
  };

  const onFile = async (selected: File | undefined) => {
    reset();
    setFile(null);
    setFileError(null);
    if (!selected) return;
    if (selected.size > MAX_IMPORT_BYTES) return setFileError('That file is larger than 5 MB. Split it into smaller files.');
    if (!/\.csv$/i.test(selected.name) && selected.type !== 'text/csv') return setFileError('Choose a .csv file.');
    try {
      setFile({ name: selected.name, text: await readFile(selected) });
    } catch (error) {
      setFileError(getApiErrorMessage(error));
    }
  };

  const hasErrors = (preview?.errorCount ?? 0) > 0;
  const canImport = Boolean(preview) && (preview?.validRows ?? 0) > 0 && (!hasErrors || skipInvalid) && !result;

  return (
    <MainLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <AdminHeader
          title="Import members"
          subtitle="Upload a CSV, check it, then import. Nothing is saved until you confirm."
          action={<BackLink to="/members/search">Member directory</BackLink>}
        />
        {!allowed ? (
          <NoAccess permission="member:import" />
        ) : (
          <>
            <section className="space-y-4 rounded-md border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-600">
                  Required columns: <code>firstName</code>, <code>lastName</code>. Up to 5,000 rows and 5 MB per file.
                </p>
                <button type="button" className={`${secondaryBtn} inline-flex items-center gap-2`} onClick={() => download(new Blob([IMPORT_TEMPLATE], { type: 'text/csv' }), 'member-import-template.csv')}>
                  <Download className="h-4 w-4" /> Download template
                </button>
              </div>
              <div>
                <label htmlFor="import-file" className="mb-1 block text-sm font-medium text-gray-700">CSV file</label>
                <input
                  id="import-file"
                  ref={input}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => void onFile(e.target.files?.[0])}
                  className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-4 file:py-2 file:font-medium file:text-primary-700"
                />
              </div>
              {fileError && <ErrorNotice message={fileError} />}
              <button type="button" className={primaryBtn} disabled={!file || previewMutation.isPending} onClick={() => file && previewMutation.mutate(file.text)}>
                {previewMutation.isPending ? 'Checking…' : 'Check file'}
              </button>
              {previewMutation.isError && <ErrorNotice message={getApiErrorMessage(previewMutation.error)} />}
            </section>

            {preview && !result && (
              <section className="space-y-4 rounded-md border border-gray-200 bg-white p-6 shadow-sm" aria-label="Preview">
                <h2 className="text-lg font-medium text-gray-900">Check results</h2>
                <p role="status" className="text-sm text-gray-700">
                  {preview.validRows} of {preview.totalRows} rows are ready to import
                  {hasErrors ? `; ${preview.errorCount} ${preview.errorCount === 1 ? 'row has a problem' : 'rows have problems'}.` : '.'}
                </p>
                {preview.ignoredColumns.length > 0 && (
                  <p className="text-sm text-amber-700">Ignored columns: {preview.ignoredColumns.join(', ')}</p>
                )}
                {hasErrors && (
                  <>
                    <TableWrap label="Rows with problems">
                      <thead className="bg-gray-50"><tr><Th>Row</Th><Th>Problem</Th></tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {preview.errors.map((e, i) => (
                          <tr key={`${e.row}-${i}`}><Td className="whitespace-nowrap">{e.row}</Td><Td>{e.message}</Td></tr>
                        ))}
                      </tbody>
                    </TableWrap>
                    {preview.errorCount > preview.errors.length && <p className="text-xs text-gray-500">Showing the first {preview.errors.length} problems.</p>}
                    <label className="flex items-start gap-2 text-sm text-gray-700">
                      <input type="checkbox" checked={skipInvalid} onChange={(e) => setSkipInvalid(e.target.checked)} className="mt-1" />
                      <span>Skip the {preview.errorCount} problem row(s) and import the rest</span>
                    </label>
                  </>
                )}
                <div className="flex flex-wrap gap-3">
                  <button type="button" className={primaryBtn} disabled={!canImport || importMutation.isPending} onClick={() => importMutation.mutate()}>
                    {importMutation.isPending ? 'Importing…' : `Import ${skipInvalid || !hasErrors ? preview.validRows : 0} member${preview.validRows === 1 ? '' : 's'}`}
                  </button>
                  <button type="button" className={secondaryBtn} onClick={() => { reset(); setFile(null); if (input.current) input.current.value = ''; }}>Start over</button>
                </div>
                {importMutation.isError && <ErrorNotice message={getApiErrorMessage(importMutation.error)} />}
              </section>
            )}

            {result && (
              <section className="space-y-3" aria-label="Import result">
                <SuccessNotice message={`Imported ${result.imported} of ${result.totalRows} rows${result.skipped ? `; ${result.skipped} skipped` : ''}.`} />
                <button type="button" className={secondaryBtn} onClick={() => { reset(); setFile(null); if (input.current) input.current.value = ''; }}>Import another file</button>
              </section>
            )}

            <section className="space-y-3">
              <h2 className="text-lg font-medium text-gray-900">Recent imports</h2>
              {history.isError ? (
                <ErrorBlock error={history.error} />
              ) : history.data && history.data.length > 0 ? (
                <TableWrap label="Recent imports">
                  <thead className="bg-gray-50"><tr><Th>File</Th><Th>Date</Th><Th>Status</Th><Th>Imported</Th><Th>Skipped</Th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {history.data.map((h) => (
                      <tr key={h.id}>
                        <Td className="break-all">{h.fileName}</Td><Td>{formatDate(h.createdAt)}</Td><Td><Badge value={h.status} /></Td><Td>{h.imported} / {h.totalRows}</Td><Td>{h.skipped}</Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              ) : (
                <EmptyBlock message="No imports yet." />
              )}
            </section>
          </>
        )}
      </div>
    </MainLayout>
  );
};
