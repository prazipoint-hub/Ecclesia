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
  <nav aria-label="Finance sections" className="flex gap-1 overflow-x-auto rounded-xl border border-gray-200/80 bg-white p-1.5 shadow-sm print:hidden">
    {LINKS.map((link) => (
      <NavLink
        key={link.to}
        to={link.to}
        end={link.to === '/finance'}
        className={({ isActive }) =>
          `min-h-9 shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${isActive ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`
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
  return `inline-block rounded-full border border-black/[0.04] px-2.5 py-1 text-xs font-semibold ${tone[status] ?? 'bg-gray-100 text-gray-700'}`;
};

export const th = 'bg-gray-50/80 px-4 py-3.5 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500';
export const td = 'px-4 py-3.5 text-sm text-gray-700';
export const num = 'px-4 py-3.5 text-right text-sm font-medium tabular-nums text-gray-800';

export const ApiError = ({ error }: { error: unknown }) => <ErrorNotice message={getApiErrorMessage(error)} />;
