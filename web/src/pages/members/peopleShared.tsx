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
  <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[value] ?? 'bg-gray-100 text-gray-700'}`}>
    {label ?? value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}
  </span>
);

export const BackLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link to={to} className="text-sm font-medium text-primary-600 hover:text-primary-700">
    {children}
  </Link>
);

export const Header = ({ title, subtitle, back, action }: { title: string; subtitle?: string; back?: ReactNode; action?: ReactNode }) => (
  <div className="flex flex-wrap items-start justify-between gap-4">
    <div className="min-w-0">
      {back}
      <h1 className="mt-1 break-words text-3xl font-bold text-gray-900">{title}</h1>
      {subtitle && <p className="mt-2 text-gray-600">{subtitle}</p>}
    </div>
    {action && <div className="flex flex-wrap gap-2">{action}</div>}
  </div>
);

export const TableWrap = ({ children, label }: { children: ReactNode; label: string }) => (
  <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
    <table aria-label={label} className="min-w-full divide-y divide-gray-200 text-sm">
      {children}
    </table>
  </div>
);

export const Th = ({ children }: { children?: ReactNode }) => (
  <th scope="col" className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
    {children}
  </th>
);

export const Td = ({ children, className = '' }: { children?: ReactNode; className?: string }) => <td className={`px-4 py-3 align-top text-gray-700 ${className}`}>{children}</td>;

export const FormError = ({ error }: { error: unknown }) => (error ? <ErrorNotice message={getApiErrorMessage(error)} /> : null);

export const selectClass = 'block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200';

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
