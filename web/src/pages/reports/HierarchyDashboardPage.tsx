import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ErrorBlock, LoadingBlock } from '@/pages/account/shared';
import type { HierarchyChurchRow, HierarchyDashboard } from '@/types/reports';
import { apiClient } from '@/utils/api';
import { ApiError, R, Shell, td, th } from './reportsShared';
import { Tile } from './dashboardParts';

const LEVELS = ['CIRCUIT', 'DISTRICT', 'CONFERENCE'] as const;
type SortKey = 'name' | 'activeMembers' | 'eventsLast30Days' | 'attendanceLast30Days';

export const HierarchyDashboardPage = () => {
  const [level, setLevel] = useState<(typeof LEVELS)[number]>('CIRCUIT');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  const query = useQuery({
    queryKey: ['reports', 'dashboard', 'hierarchy', level],
    retry: false,
    queryFn: async () => (await apiClient.get<HierarchyDashboard>(`${R}/dashboards/hierarchy/${level.toLowerCase()}`)).data,
  });

  const rows = useMemo(() => {
    const copy = [...(query.data?.churches ?? [])];
    copy.sort((a: HierarchyChurchRow, b: HierarchyChurchRow) => (sort.key === 'name' ? a.name.localeCompare(b.name) : a[sort.key] - b[sort.key]) * sort.dir);
    return copy;
  }, [query.data, sort]);

  const header = (key: SortKey, text: string) => (
    <th className={th} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="font-medium uppercase" onClick={() => setSort({ key, dir: sort.key === key && sort.dir === 1 ? -1 : 1 })}>{text}{sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</button>
    </th>
  );

  return (
    <Shell title="Circuit, district and conference" subtitle="Counts for each church in your part of the hierarchy. No personal or financial detail." permission="report:view:all_churches">
      <div role="tablist" className="flex gap-1">
        {LEVELS.map((l) => (
          <button key={l} role="tab" aria-selected={level === l} type="button" onClick={() => setLevel(l)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${level === l ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100'}`}>{l.charAt(0) + l.slice(1).toLowerCase()}</button>
        ))}
      </div>
      {query.isLoading ? <LoadingBlock /> : query.error ? (
        (query.error as { response?: { status?: number } }).response?.status === 404
          ? <p role="status" className="rounded-lg bg-gray-50 p-4 text-sm text-gray-700">Your church is not part of a {level.toLowerCase()}, so there is nothing to total up.</p>
          : <><ApiError error={query.error} /><ErrorBlock error={query.error} onRetry={() => void query.refetch()} /></>
      ) : query.data && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium text-gray-900">{query.data.name}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Tile name="Churches" value={query.data.totals.churches} />
            <Tile name="Active members" value={query.data.totals.activeMembers} />
            <Tile name="Attendance, last 30 days" value={query.data.totals.attendanceLast30Days} />
          </div>
          <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead><tr>{header('name', 'Church')}{header('activeMembers', 'Active members')}{header('eventsLast30Days', 'Events (30d)')}{header('attendanceLast30Days', 'Attendance (30d)')}</tr></thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((c) => <tr key={c.churchId}><td className={td}>{c.name}{c.circuit ? <span className="ml-2 text-xs text-gray-500">{c.circuit}</span> : null}</td><td className={td}>{c.activeMembers}</td><td className={td}>{c.eventsLast30Days}</td><td className={td}>{c.attendanceLast30Days}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Shell>
  );
};
