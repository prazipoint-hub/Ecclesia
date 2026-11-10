import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { EmptyBlock, ErrorBlock, LoadingBlock, card, formatDate } from '@/pages/account/shared';
import { apiClient } from '@/utils/api';
import type { Dashboard } from '@/types/pastoral';
import { P, Shell, Tag, label, memberName, usePermissions } from './pastoralShared';

const Stat = ({ title, value, hint }: { title: string; value: number | string; hint?: string }) => (
  <div className={`${card} relative overflow-hidden`}>
    <span className="absolute inset-y-0 left-0 w-1 bg-primary-500" />
    <p className="text-sm font-medium text-gray-500">{title}</p>
    <p className="mt-2 font-display text-2xl font-medium text-gray-950">{value}</p>
    {hint && <p className="mt-2 text-xs leading-relaxed text-gray-500">{hint}</p>}
  </div>
);

export const PastoralDashboardPage = () => {
  const has = usePermissions();
  const dashboard = useQuery({
    queryKey: ['pastoral', 'dashboard'],
    enabled: has('pastoral:dashboard:view'),
    queryFn: async () => (await apiClient.get<Dashboard>(`${P}/dashboard`)).data,
  });
  const d = dashboard.data;

  return (
    <Shell title="Pastoral dashboard" subtitle="Who needs care today." permission="pastoral:dashboard:view">
      {dashboard.isLoading ? <LoadingBlock /> : dashboard.error ? <ErrorBlock error={dashboard.error} onRetry={() => void dashboard.refetch()} /> : d && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat title="Open cases" value={d.openCases.total} hint={Object.entries(d.openCases.byPriority).map(([k, v]) => `${label(k)}: ${v}`).join(' · ')} />
            <Stat title="Overdue follow-ups" value={d.followUps.overdue} />
            <Stat title="Visits (30 days)" value={d.visitsLast30Days} />
            <Stat title="Not visited" value={d.unvisitedMembers.count} hint={`of ${d.unvisitedMembers.activeMembers} active members, ${d.unvisitedMembers.thresholdDays}+ days`} />
          </div>
          <section className={card}>
            <h2 className="mb-1 text-lg font-medium text-gray-950">Priority cases</h2>
            <p className="mb-4 text-sm text-gray-500">Cases that need the team’s attention first.</p>
            {d.priorityCases.length === 0 ? <EmptyBlock message="No high-priority cases." /> : (
              <ul className="divide-y divide-gray-100">
                {d.priorityCases.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <span><Link className="font-medium text-primary-600 hover:underline" to={`/pastoral/members/${c.member?.id ?? ''}`}>{memberName(c.member)}</Link> — {label(c.category)}</span>
                    <Tag value={c.priority} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className={card}>
            <h2 className="mb-1 text-lg font-medium text-gray-950">Follow-ups due this week</h2>
            <p className="mb-4 text-sm text-gray-500">Planned care touchpoints for the next seven days.</p>
            {d.followUps.dueThisWeek.length === 0 ? <EmptyBlock message="Nothing due this week." /> : (
              <ul className="divide-y divide-gray-100">
                {d.followUps.dueThisWeek.map((f) => (
                  <li key={f.id} className="flex justify-between gap-3 py-3 text-sm"><span className="font-medium text-gray-800">{memberName(f.member)} — {f.reason}</span><span className="whitespace-nowrap text-gray-500">{formatDate(f.dueDate)}</span></li>
                ))}
              </ul>
            )}
          </section>
          <div className="grid gap-4 md:grid-cols-2">
            <section className={card}>
              <h2 className="mb-3 text-lg font-medium">Prayer requests</h2>
              <p className="text-sm text-gray-600">{Object.keys(d.prayerRequests).length === 0 ? 'None yet.' : Object.entries(d.prayerRequests).map(([k, v]) => `${label(k)}: ${v}`).join(' · ')}</p>
              <p className="mt-1 text-xs text-gray-500">Confidential requests are not counted.</p>
            </section>
            <section className={card}>
              <h2 className="mb-3 text-lg font-medium">Flagged assessments</h2>
              {d.flaggedAssessments.length === 0 ? <p className="text-sm text-gray-500">None.</p> : (
                <ul className="space-y-1 text-sm">
                  {d.flaggedAssessments.map((a) => (
                    <li key={a.id}><Link className="text-primary-600 hover:underline" to={`/pastoral/members/${a.memberId}`}>Member {a.memberId.slice(0, 8)}</Link> — {formatDate(a.assessedAt)}</li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </Shell>
  );
};
