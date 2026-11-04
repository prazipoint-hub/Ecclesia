import { useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import { MainLayout } from '@/components/Layout/MainLayout';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/pages/account/shared';
import { AdminHeader, NoAccess } from '@/pages/admin/adminShared';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { usePermissions } from '@/pages/finance/financeShared';
import type { CareMember, Paged } from '@/types/pastoral';

export { usePermissions };
export const P = '/api/v2/pastoral';
export const PAGE_SIZE = 20;

export const ApiError = ({ error }: { error: unknown }) => (error ? <ErrorNotice message={getApiErrorMessage(error)} /> : null);

export const today = (): string => new Date().toISOString().slice(0, 10);
export const memberName = (m?: CareMember | null): string => (m ? `${m.firstName} ${m.lastName}` : '—');
export const label = (value: string | null | undefined): string => (value ? value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '—');

const LINKS: Array<{ to: string; label: string; permission?: string; end?: boolean }> = [
  { to: '/pastoral', label: 'Cases', end: true },
  { to: '/pastoral/dashboard', label: 'Dashboard', permission: 'pastoral:dashboard:view' },
  { to: '/pastoral/visits', label: 'Visits', permission: 'pastoral:visit:view' },
  { to: '/pastoral/counseling', label: 'Counseling', permission: 'pastoral:counseling:view' },
  { to: '/pastoral/prayer', label: 'Prayer' },
  { to: '/pastoral/referrals', label: 'Referrals', permission: 'pastoral:referral:view' },
  { to: '/pastoral/followups', label: 'Follow-ups', permission: 'pastoral:followup:view' },
  { to: '/pastoral/assessments', label: 'Assessments', permission: 'pastoral:assessment:view' },
  { to: '/pastoral/sacraments', label: 'Sacraments', permission: 'pastoral:sacrament:manage' },
];

export const PastoralNav = () => {
  const has = usePermissions();
  return (
    <nav aria-label="Pastoral sections" className="flex flex-wrap gap-1 border-b border-gray-200 pb-2">
      {LINKS.filter((l) => !l.permission || has(l.permission)).map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          className={({ isActive }) => `rounded-lg px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
};

/** Paginated GET with skip/take; returns the query plus page controls. */
export const usePagedList = <T,>(key: string, path: string, params: Record<string, string | undefined> = {}, enabled = true) => {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['pastoral', key, params, page],
    enabled,
    queryFn: async () =>
      (await apiClient.get<Paged<T>>(`${P}${path}`, { params: { ...Object.fromEntries(Object.entries(params).filter(([, v]) => v)), skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE } })).data,
  });
  return { query, page, setPage };
};

export const selectOptions = (values: string[]) => values.map((v) => ({ value: v, label: label(v) }));

export const Shell = ({ title, subtitle, action, permission, children }: { title: string; subtitle?: string; action?: ReactNode; permission?: string; children: ReactNode }) => {
  const has = usePermissions();
  return (
    <MainLayout>
      <div className="space-y-6">
        <AdminHeader title={title} subtitle={subtitle} action={action} />
        <PastoralNav />
        {permission && !has(permission) ? <NoAccess permission={permission} /> : children}
      </div>
    </MainLayout>
  );
};

export const th = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500';
export const td = 'px-3 py-2 text-sm text-gray-800 align-top';
export const tone = (value: string): string => {
  const red = ['URGENT', 'OVERDUE', 'FAITH_CRISIS', 'CRISIS', 'DECLINED'];
  const green = ['COMPLETED', 'RECORDED', 'RESOLVED', 'CLOSED'];
  return `inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${red.includes(value) ? 'bg-red-100 text-red-700' : green.includes(value) ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`;
};
export const Tag = ({ value }: { value: string }) => <span className={tone(value)}>{label(value)}</span>;

export const DataState = ({ query, empty, children }: { query: { isLoading: boolean; error: unknown; refetch: () => unknown; data?: { items: unknown[] } }; empty: string; children: ReactNode }) =>
  query.isLoading ? <LoadingBlock /> : query.error ? <ErrorBlock error={query.error} onRetry={() => void query.refetch()} /> : query.data && query.data.items.length === 0 ? <EmptyBlock message={empty} /> : <>{children}</>;
