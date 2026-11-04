import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FormSelect } from '@/components/forms/FormSelect';
import { FormField } from '@/components/forms/FormField';
import { ErrorBlock, LoadingBlock, formatDate, primaryBtn } from '@/pages/account/shared';
import { money } from '@/pages/finance/financeShared';
import { useSections } from '@/pages/members/useSections';
import type { ChurchDashboard } from '@/types/reports';
import { apiClient } from '@/utils/api';
import { AttendanceBlockView, Block, IncomeSpendingBars, MembersBlockView, Tile } from './dashboardParts';
import { R, Shell, label } from './reportsShared';

export const ChurchDashboardPage = () => {
  const navigate = useNavigate();
  const sections = useSections();
  const [sectionId, setSectionId] = useState('');
  const query = useQuery({ queryKey: ['reports', 'dashboard', 'church'], queryFn: async () => (await apiClient.get<ChurchDashboard>(`${R}/dashboards/church`)).data });
  const d = query.data;
  const empty = d && !d.members && !d.attendance && !d.finance && !d.pastoral && !d.upcomingEvents;

  return (
    <Shell title="Church dashboard" subtitle={d ? `Live figures as of ${new Date(d.generatedAt).toLocaleString()}` : 'Live figures for your church.'}>
      {query.isLoading ? <LoadingBlock /> : query.error ? <ErrorBlock error={query.error} onRetry={() => void query.refetch()} /> : d && (
        <div className="space-y-6">
          {empty && <p className="text-sm text-gray-500">Nothing on this dashboard is available for your role.</p>}
          {d.members && <MembersBlockView data={d.members} />}
          {d.attendance && <AttendanceBlockView data={d.attendance} />}
          {d.finance && (
            <Block title="Finance">
              <div className="grid gap-3 sm:grid-cols-3">
                {Object.entries(d.finance.incomeThisMonth).map(([currency, amount]) => <Tile key={currency} name={`Income this month (${currency})`} value={money(amount)} />)}
                {Object.keys(d.finance.incomeThisMonth).length === 0 && <Tile name="Income this month" value={money(0)} />}
                <Tile name="Spending this month" value={money(d.finance.spendingThisMonth)} />
                <Tile name="Awaiting approval" value={d.finance.awaitingApproval} hint="Expenditure requests" />
              </div>
              {Object.keys(d.finance.incomeThisMonthByType).length > 0 && (
                <p className="text-sm text-gray-600">By type: {Object.entries(d.finance.incomeThisMonthByType).map(([t, v]) => `${label(t)} ${money(v)}`).join(' · ')}</p>
              )}
              <IncomeSpendingBars months={d.finance.months} />
              <p className="text-xs text-gray-500">{d.finance.note}</p>
              {d.finance.truncated && <p role="note" className="text-xs text-amber-700">Only the first 5,000 records were counted, so these figures are incomplete.</p>}
            </Block>
          )}
          {d.pastoral && (
            <Block title="Pastoral care">
              <div className="grid gap-3 sm:grid-cols-2"><Tile name="Open cases" value={d.pastoral.openCases} /><Tile name="Overdue follow-ups" value={d.pastoral.overdueFollowUps} /></div>
            </Block>
          )}
          {d.upcomingEvents && (
            <Block title="Upcoming events">
              {d.upcomingEvents.length === 0 ? <p className="text-sm text-gray-500">Nothing scheduled.</p> : (
                <ul className="divide-y divide-gray-100">
                  {d.upcomingEvents.map((e) => <li key={e.id} className="flex justify-between py-2 text-sm"><span className="font-medium text-gray-900">{e.title}<span className="ml-2 text-gray-500">{label(e.eventType)}{e.location ? ` · ${e.location}` : ''}</span></span><span className="text-gray-600">{formatDate(e.startDateTime)}</span></li>)}
                </ul>
              )}
            </Block>
          )}

          <Block title="Look at one section">
            <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (sectionId.trim()) navigate(`/dashboard/section/${encodeURIComponent(sectionId.trim())}`); }}>
              {(sections.data?.length ?? 0) > 0
                ? <FormSelect label="Section" value={sectionId} placeholder="Choose a section" options={sections.data!.map((s) => ({ value: s.id, label: s.name }))} onChange={(e) => setSectionId(e.target.value)} className="min-w-[14rem]" />
                : <FormField label="Section ID" value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="min-w-[14rem]" />}
              <button type="submit" className={primaryBtn} disabled={!sectionId.trim()}>Open section dashboard</button>
            </form>
          </Block>
        </div>
      )}
    </Shell>
  );
};
