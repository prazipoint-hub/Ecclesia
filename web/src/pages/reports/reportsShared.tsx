import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { MainLayout } from '@/components/Layout/MainLayout';
import { AdminHeader, NoAccess } from '@/pages/admin/adminShared';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { usePermissions } from '@/pages/finance/financeShared';
import { download } from '@/pages/members/peopleShared';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import type { RunOutcome } from '@/types/reports';

export { usePermissions, download };
export const R = '/api/v2/reports';

export const ApiError = ({ error }: { error: unknown }) => (error ? <ErrorNotice message={getApiErrorMessage(error)} /> : null);
export const label = (value: string | null | undefined): string => (value ? value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '—');
export const dateTime = (iso: string | null | undefined): string => (iso ? new Date(iso).toLocaleString() : '—');
export const th = 'bg-gray-50/80 px-4 py-3.5 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500';
export const td = 'px-4 py-3.5 text-sm text-gray-700 align-top';

const LINKS: Array<{ to: string; label: string; permission?: string; end?: boolean }> = [
  { to: '/reports', label: 'Catalog', end: true },
  { to: '/reports/build', label: 'Build a report' },
  { to: '/reports/saved', label: 'Saved reports' },
  { to: '/dashboard/church', label: 'Church dashboard' },
  { to: '/dashboard/hierarchy', label: 'Circuit / district / conference', permission: 'report:view:all_churches' },
];

export const ReportsNav = () => {
  const has = usePermissions();
  return (
    <nav aria-label="Report sections" className="flex gap-1 overflow-x-auto rounded-xl border border-gray-200/80 bg-white p-1.5 shadow-sm">
      {LINKS.filter((l) => !l.permission || has(l.permission)).map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          className={({ isActive }) => `min-h-9 shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${isActive ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
};

export const Shell = ({ title, subtitle, action, permission, children }: { title: string; subtitle?: string; action?: ReactNode; permission?: string; children: ReactNode }) => {
  const has = usePermissions();
  return (
    <MainLayout>
      <div className="mx-auto max-w-[1440px] space-y-6">
        <AdminHeader title={title} subtitle={subtitle} action={action} />
        <ReportsNav />
        {permission && !has(permission) ? <NoAccess permission={permission} /> : children}
      </div>
    </MainLayout>
  );
};

export const Tag = ({ value }: { value: string }) => {
  const red = ['FAILED'];
  const green = ['SUCCEEDED'];
  return <span className={`inline-block rounded-full border border-black/[0.04] px-2.5 py-1 text-xs font-semibold ${red.includes(value) ? 'bg-red-100 text-red-700' : green.includes(value) ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>{label(value)}</span>;
};

export const bytes = (n: number | null | undefined): string => (n === null || n === undefined ? '—' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

const filenameFrom = (disposition: unknown, fallback: string): string => {
  const match = typeof disposition === 'string' ? /filename="?([^";]+)"?/i.exec(disposition) : null;
  return match?.[1] ?? fallback;
};

/** With a blob response type an error body arrives as a Blob too; turn it back into the server's message. */
const readableError = async (error: unknown): Promise<unknown> => {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text()) as { error?: string };
      (error as { response: { data: unknown } }).response.data = parsed;
    } catch {
      /* keep the original error */
    }
  }
  return error;
};

/** Runs a report. A file is downloaded straight away; JSON is handed back so the page can preview it. */
export async function runReport(method: 'post', path: string, body?: unknown): Promise<RunOutcome> {
  try {
    const response = await apiClient[method]<Blob>(path, body, { responseType: 'blob' });
    const blob = response.data;
    const filename = filenameFrom(response.headers?.['content-disposition'], 'report');
    if (blob.type.includes('json')) {
      const parsed = JSON.parse(await blob.text()) as { filename?: string; data?: unknown };
      return { kind: 'json', filename: parsed.filename ?? filename, data: parsed.data ?? parsed };
    }
    download(blob, filename);
    return { kind: 'file', filename };
  } catch (error) {
    throw await readableError(error);
  }
}

/** A plain table for an array of flat records, or a pre block for anything else. */
export const JsonPreview = ({ data }: { data: unknown }) => {
  const rows = Array.isArray(data) && data.length > 0 && data.every((r) => r && typeof r === 'object' && !Array.isArray(r)) ? (data as Array<Record<string, unknown>>) : null;
  if (!rows) return <pre className="max-h-96 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-800">{JSON.stringify(data, null, 2)}</pre>;
  const columns = [...new Set(rows.slice(0, 50).flatMap((r) => Object.keys(r)))];
  return (
    <div className="max-h-96 overflow-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50"><tr>{columns.map((c) => <th key={c} className={th}>{c}</th>)}</tr></thead>
        <tbody className="divide-y divide-gray-100">
          {rows.slice(0, 50).map((r, i) => (
            <tr key={i}>{columns.map((c) => <td key={c} className={td}>{typeof r[c] === 'object' && r[c] !== null ? JSON.stringify(r[c]) : String(r[c] ?? '')}</td>)}</tr>
          ))}
        </tbody>
      </table>
      {rows.length > 50 && <p className="p-2 text-xs text-gray-500">Showing the first 50 of {rows.length} rows. Download CSV for everything.</p>}
    </div>
  );
};
