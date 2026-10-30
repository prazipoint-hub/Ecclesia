import type { ReactNode } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getApiErrorMessage } from '@/utils/apiError';

export const card = 'rounded-xl border border-gray-200 bg-white p-6 shadow-sm';
export const primaryBtn =
  'rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60';
export const secondaryBtn =
  'rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60';

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
  <div className="flex flex-wrap items-start justify-between gap-4">
    <div>
      <Link to="/my-account" className="text-sm font-medium text-primary-600 hover:text-primary-700">
        My Account
      </Link>
      <h1 className="mt-1 text-3xl font-bold text-gray-900">{title}</h1>
      {subtitle && <p className="mt-2 text-gray-600">{subtitle}</p>}
    </div>
    {action}
  </div>
);

export const LoadingBlock = ({ label = 'Loading…' }: { label?: string }) => (
  <div role="status" className="flex items-center gap-2 py-8 text-sm text-gray-500">
    <Loader2 className="h-4 w-4 animate-spin" /> {label}
  </div>
);

export const ErrorBlock = ({ error, onRetry }: { error: unknown; onRetry?: () => void }) => (
  <div role="alert" className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
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
  <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">{message}</p>
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
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm text-gray-600">
      <button type="button" className={secondaryBtn} disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span>
        Page {page} of {pages}
      </span>
      <button type="button" className={secondaryBtn} disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </nav>
  );
};
