import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FormField } from '@/components/forms/FormField';
import { EmptyBlock, ErrorBlock, LoadingBlock, card } from '@/pages/account/shared';
import { apiClient } from '@/utils/api';
import type { Analytics } from '@/types/events';
import { E, Shell, dateTime, label, td, th, usePermissions } from './eventsShared';

const Tile = ({ title, value }: { title: string; value: number | string }) => (
  <div className={card}><p className="text-sm text-gray-500">{title}</p><p className="mt-1 text-3xl font-bold text-gray-900">{value}</p></div>
);

const Bar = ({ value, max }: { value: number; max: number }) => (
  <div className="h-2 w-full rounded bg-gray-100" aria-hidden="true"><div className="h-2 rounded bg-primary-500" style={{ width: `${max > 0 ? Math.round((value / max) * 100) : 0}%` }} /></div>
);

export const AnalyticsPage = () => {
  const has = usePermissions();
  const [filters, setFilters] = useState({ from: '', to: '', eventType: '' });
  const query = useQuery({
    queryKey: ['events', 'analytics', filters],
    enabled: has('attendance:analytics:view'),
    queryFn: async () => (await apiClient.get<Analytics>(`${E}/analytics/attendance`, { params: Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) })).data,
  });
  const data = query.data;
  const maxType = Math.max(0, ...(data?.byType.map((t) => t.present) ?? []));
  const maxMonth = Math.max(0, ...(data?.byMonth.map((m) => m.present) ?? []));

  return (
    <Shell title="Attendance analytics" subtitle="Who came, how often, and how they checked in." permission="attendance:analytics:view">
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label="From" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        <FormField label="To" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        <FormField label="Event type" value={filters.eventType} placeholder="e.g. SERVICE" onChange={(e) => setFilters({ ...filters, eventType: e.target.value.toUpperCase() })} />
      </div>
      {query.isLoading ? <LoadingBlock /> : query.error ? <ErrorBlock error={query.error} onRetry={() => void query.refetch()} /> : !data || data.totalEvents === 0 ? <EmptyBlock message="No events with attendance in this period." /> : (
        <>
          {data.truncated && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Only the first 500 events are included. Narrow the dates for complete figures.</p>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile title="Events" value={data.totalEvents} />
            <Tile title="Total present" value={data.totalPresent} />
            <Tile title="Average per event" value={data.averagePerEvent} />
            <Tile title="Unique attendees" value={data.uniqueAttendees} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className={card}>
              <h2 className="mb-3 font-semibold text-gray-900">By type</h2>
              <ul className="space-y-3">{data.byType.map((t) => (
                <li key={t.eventType}><div className="flex justify-between text-sm"><span>{label(t.eventType)} <span className="text-gray-500">({t.events} events)</span></span><span>{t.present} · avg {t.average}</span></div><Bar value={t.present} max={maxType} /></li>
              ))}</ul>
            </section>
            <section className={card}>
              <h2 className="mb-3 font-semibold text-gray-900">By month</h2>
              <ul className="space-y-3">{data.byMonth.map((m) => (
                <li key={m.month}><div className="flex justify-between text-sm"><span>{m.month} <span className="text-gray-500">({m.events} events)</span></span><span>{m.present} · avg {m.average}</span></div><Bar value={m.present} max={maxMonth} /></li>
              ))}</ul>
            </section>
          </div>
          <section className={card}>
            <h2 className="mb-3 font-semibold text-gray-900">How people checked in</h2>
            {Object.keys(data.checkInMethods).length === 0 ? <p className="text-sm text-gray-500">No check-ins recorded.</p> : (
              <ul className="flex flex-wrap gap-4 text-sm">{Object.entries(data.checkInMethods).map(([method, n]) => <li key={method}><span className="font-semibold">{n}</span> {label(method)}</li>)}</ul>
            )}
          </section>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead><tr><th className={th}>Event</th><th className={th}>When</th><th className={th}>Present</th><th className={th}>Registered</th><th className={th}>Expected</th><th className={th}>Rate</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {data.events.map((ev) => (
                  <tr key={ev.id}>
                    <td className={td}>{ev.title}</td><td className={td}>{dateTime(ev.startDateTime)}</td><td className={td}>{ev.present}</td><td className={td}>{ev.registered}</td>
                    <td className={td}>{ev.expected ?? '—'}</td><td className={td}>{ev.attendanceRate === null ? '—' : `${ev.attendanceRate}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Shell>
  );
};
