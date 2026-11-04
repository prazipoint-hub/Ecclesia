import { ErrorNotice } from '@/pages/auth/AuthShell';
import { getApiErrorMessage } from '@/utils/apiError';
import { NavLink } from 'react-router-dom';
import { can } from '@/types/notifications';
import { useAuthStore } from '@stores/authStore';

export const money = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const today = (): string => new Date().toISOString().slice(0, 10);

export const toDateInput = (iso: string | null | undefined): string => (iso ? iso.slice(0, 10) : '');

const LINKS: Array<{ to: string; label: string }> = [
  { to: '/finance', label: 'Overview' },
  { to: '/finance/accounts', label: 'Accounts' },
  { to: '/finance/journals', label: 'Journals' },
  { to: '/finance/periods', label: 'Periods' },
  { to: '/finance/budgets', label: 'Budgets' },
  { to: '/finance/funds', label: 'Funds' },
  { to: '/finance/cash-sessions', label: 'Cash sessions' },
  { to: '/finance/reports', label: 'Reports' },
];

export const FinanceNav = () => (
  <nav aria-label="Finance sections" className="flex flex-wrap gap-1 border-b border-gray-200 pb-2 print:hidden">
    {LINKS.map((link) => (
      <NavLink
        key={link.to}
        to={link.to}
        end={link.to === '/finance'}
        className={({ isActive }) =>
          `rounded-lg px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100'}`
        }
      >
        {link.label}
      </NavLink>
    ))}
  </nav>
);

export const usePermissions = () => {
  const permissions = useAuthStore((state) => state.user?.permissions);
  return (permission: string) => can(permissions, permission);
};

export const statusBadge = (status: string): string => {
  const tone: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-700',
    POSTED: 'bg-green-100 text-green-700',
    REVERSED: 'bg-amber-100 text-amber-800',
    OPEN: 'bg-blue-100 text-blue-700',
    CLOSED: 'bg-gray-200 text-gray-700',
    APPROVED: 'bg-green-100 text-green-700',
  };
  return `inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${tone[status] ?? 'bg-gray-100 text-gray-700'}`;
};

export const th = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500';
export const td = 'px-3 py-2 text-sm text-gray-800';
export const num = 'px-3 py-2 text-right text-sm tabular-nums text-gray-800';

export const ApiError = ({ error }: { error: unknown }) => <ErrorNotice message={getApiErrorMessage(error)} />;
