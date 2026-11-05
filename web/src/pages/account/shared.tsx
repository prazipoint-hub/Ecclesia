import type { ReactNode } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getApiErrorMessage } from '@/utils/apiError';

export const card = 'rounded-2xl border border-gray-200/80 bg-white p-5 shadow-soft sm:p-6';
export const primaryBtn =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60';
export const secondaryBtn =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:border-primary-200 hover:bg-primary-50 hover:text-primary-800 disabled:cursor-not-allowed disabled:opacity-60';

export const formatMoney = (amount: number, currency: string): string => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
};

export const formatDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

export const titleCase = (value: string | null | undefined): string =>
  value ? value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (char) => char.toUpperCase()) : '—';

export const PageHeader = ({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) => (
  <div className="flex flex-wrap items-end justify-between gap-4">
    <div>
      <Link to="/my-account" className="page-eyebrow hover:text-primary-900">
        My Account
      </Link>
      <h1 className="mt-2 text-3xl font-semibold text-gray-950 sm:text-4xl">{title}</h1>
      {subtitle && <p className="mt-2 max-w-2xl text-gray-600">{subtitle}</p>}
    </div>
    {action}
  </div>
);

export const LoadingBlock = ({ label = 'Loading…' }: { label?: string }) => (
  <div role="status" className="flex min-h-32 items-center justify-center gap-3 rounded-2xl border border-gray-200/80 bg-white py-8 text-sm font-medium text-gray-500 shadow-soft">
    <Loader2 className="h-5 w-5 animate-spin text-primary-600" /> {label}
  </div>
);

export const ErrorBlock = ({ error, onRetry }: { error: unknown; onRetry?: () => void }) => (
  <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm">
    <span className="rounded-lg bg-red-100 p-2"><AlertTriangle className="h-4 w-4 shrink-0" /></span>
    <div className="flex-1">
      <p>{getApiErrorMessage(error)}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 font-semibold underline">
          Try again
        </button>
      )}
    </div>
  </div>
);

export const EmptyBlock = ({ message }: { message: string }) => (
  <div className="flex min-h-36 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white/60 p-6 text-center">
    <span className="mb-3 rounded-xl bg-gray-100 p-2.5 text-gray-500"><Inbox className="h-5 w-5" /></span>
    <p className="max-w-md text-sm leading-relaxed text-gray-500">{message}</p>
  </div>
);

export const Pagination = ({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) => {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between rounded-xl border border-gray-200/80 bg-white p-2 text-sm text-gray-600 shadow-sm">
      <button type="button" className={secondaryBtn} disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft className="h-4 w-4" /> Previous
      </button>
      <span>
        Page {page} of {pages}
      </span>
      <button type="button" className={secondaryBtn} disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
};
