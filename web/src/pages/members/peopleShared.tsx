import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { getApiErrorMessage } from '@/utils/apiError';

const TONES: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800', COMPLETED: 'bg-green-100 text-green-800', APPROVED: 'bg-green-100 text-green-800', HELD: 'bg-green-100 text-green-800', JOINED: 'bg-green-100 text-green-800',
  NEW: 'bg-blue-100 text-blue-800', SCHEDULED: 'bg-blue-100 text-blue-800', PROPOSED: 'bg-blue-100 text-blue-800', CONTACTED: 'bg-indigo-100 text-indigo-800',
  INACTIVE: 'bg-gray-100 text-gray-700', CANCELLED: 'bg-gray-100 text-gray-700', DEFERRED: 'bg-amber-100 text-amber-800', PARTIAL: 'bg-amber-100 text-amber-800', NOT_INTERESTED: 'bg-gray-100 text-gray-700',
  TRANSFERRED: 'bg-amber-100 text-amber-800', DECEASED: 'bg-gray-200 text-gray-700', TERMINATED: 'bg-red-100 text-red-800', REJECTED: 'bg-red-100 text-red-800', FAILED: 'bg-red-100 text-red-800',
};

export const Badge = ({ value, label }: { value: string; label?: string }) => (
  <span className={`inline-flex whitespace-nowrap rounded-full border border-black/[0.04] px-2.5 py-1 text-xs font-semibold ${TONES[value] ?? 'bg-gray-100 text-gray-700'}`}>
    {label ?? value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}
  </span>
);

export const BackLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link to={to} className="text-sm font-medium text-primary-600 hover:text-primary-700">
    {children}
  </Link>
);

export const Header = ({ title, subtitle, back, action }: { title: string; subtitle?: string; back?: ReactNode; action?: ReactNode }) => (
  <div className="flex flex-wrap items-end justify-between gap-4">
    <div className="min-w-0">
      {back}
      <h1 className="mt-2 break-words text-3xl font-semibold text-gray-950 sm:text-4xl">{title}</h1>
      {subtitle && <p className="mt-2 max-w-2xl text-gray-600">{subtitle}</p>}
    </div>
    {action && <div className="flex flex-wrap gap-2">{action}</div>}
  </div>
);

export const TableWrap = ({ children, label }: { children: ReactNode; label: string }) => (
  <div className="overflow-x-auto rounded-2xl border border-gray-200/80 bg-white shadow-soft">
    <table aria-label={label} className="min-w-full divide-y divide-gray-100 text-sm">
      {children}
    </table>
  </div>
);

export const Th = ({ children }: { children?: ReactNode }) => (
  <th scope="col" className="whitespace-nowrap bg-gray-50/80 px-5 py-3.5 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500">
    {children}
  </th>
);

export const Td = ({ children, className = '' }: { children?: ReactNode; className?: string }) => <td className={`px-5 py-4 align-top text-gray-700 ${className}`}>{children}</td>;

export const FormError = ({ error }: { error: unknown }) => (error ? <ErrorNotice message={getApiErrorMessage(error)} /> : null);

export const selectClass = 'block min-h-11 w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100';

export const download = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
