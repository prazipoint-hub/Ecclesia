import { FormEvent, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { MainLayout } from '@/components/Layout/MainLayout';
import { useAuthStore } from '@/stores/authStore';
import { apiClient } from '@/utils/api';

const reportOptions = [
  { value: 'MEMBERSHIP_SUMMARY', label: 'Membership summary' },
  { value: 'MEMBERSHIP_DETAIL', label: 'Membership detail' },
  { value: 'LEADERSHIP_ROSTER', label: 'Leadership roster' },
  { value: 'DEMOGRAPHICS', label: 'Demographics' },
];

export const ReportsPage = () => {
  const { user } = useAuthStore();
  const [reportType, setReportType] = useState(reportOptions[0].value);
  const [format, setFormat] = useState<'JSON' | 'CSV' | 'XLSX' | 'PDF'>('JSON');
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const generate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user?.churchId) return;
    setError(null);
    setResult(null);
    setIsGenerating(true);
    try {
      const response = await apiClient.post('/api/v2/reports/administrative', {
        churchId: user.churchId,
        reportType,
        format,
      }, {
        responseType: format === 'JSON' ? 'json' : 'blob',
      });
      if (format === 'JSON') {
        setResult(response.data);
      } else {
        const filename = response.headers['content-disposition']?.match(/filename="?([^";]+)"?/)?.[1]
          ?? `${reportType.toLowerCase()}.${format.toLowerCase()}`;
        const url = URL.createObjectURL(response.data as Blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(url);
      }
    } catch (requestError) {
      const response =
        typeof requestError === 'object' && requestError && 'response' in requestError
          ? (requestError as { response?: { data?: { error?: string } } }).response
          : undefined;
      setError(response?.data?.error ?? 'The report could not be generated.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary-600">
            Reporting
          </p>
          <h1 className="mt-2 text-3xl font-bold text-gray-900">Reports</h1>
          <p className="mt-2 text-gray-600">
            Generate a live administrative report for the active church workspace.
          </p>
        </div>
        {!user?.churchId ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
            Your account needs a church workspace before reports can be generated.
          </div>
        ) : (
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <form onSubmit={generate} className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <label className="flex-1 text-sm font-medium text-gray-700">
                Report type
                <select
                  value={reportType}
                  onChange={(event) => setReportType(event.target.value)}
                  className="mt-1 block w-full rounded-lg border-gray-300"
                >
                  {reportOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex-1 text-sm font-medium text-gray-700">
                Format
                <select
                  value={format}
                  onChange={(event) => setFormat(event.target.value as typeof format)}
                  className="mt-1 block w-full rounded-lg border-gray-300"
                >
                  <option value="JSON">JSON preview</option>
                  <option value="CSV">CSV download</option>
                  <option value="XLSX">Excel workbook</option>
                  <option value="PDF">PDF download</option>
                </select>
              </label>
              <button
                type="submit"
                disabled={isGenerating}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                {isGenerating ? 'Generating…' : format === 'JSON' ? 'Generate report' : 'Download report'}
              </button>
            </form>
            {error && (
              <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                {error}
              </div>
            )}
            {result !== null && (
              <div className="mt-5">
                <h2 className="font-semibold text-gray-900">Report result</h2>
                <pre className="mt-3 max-h-[28rem] overflow-auto rounded-lg bg-gray-950 p-4 text-sm text-gray-100">
                  {JSON.stringify(result, null, 2) ?? ''}
                </pre>
              </div>
            )}
          </section>
        )}
      </div>
    </MainLayout>
  );
};
