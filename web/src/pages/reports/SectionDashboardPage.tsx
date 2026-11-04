import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ErrorBlock, LoadingBlock } from '@/pages/account/shared';
import type { SectionDashboard } from '@/types/reports';
import { apiClient } from '@/utils/api';
import { AttendanceBlockView, Block, IncomeSpendingBars, MembersBlockView } from './dashboardParts';
import { R, Shell } from './reportsShared';

export const SectionDashboardPage = () => {
  const { sectionId = '' } = useParams();
  const query = useQuery({ queryKey: ['reports', 'dashboard', 'section', sectionId], enabled: Boolean(sectionId), queryFn: async () => (await apiClient.get<SectionDashboard>(`${R}/dashboards/section/${encodeURIComponent(sectionId)}`)).data });
  const d = query.data;

  return (
    <Shell title={d ? `${d.section.name} section` : 'Section dashboard'} subtitle="Members, attendance and section finance." action={<Link to="/dashboard/church" className="text-sm font-medium text-primary-700 hover:underline">Back to church dashboard</Link>}>
      {query.isLoading ? <LoadingBlock /> : query.error ? <ErrorBlock error={query.error} onRetry={() => void query.refetch()} /> : d && (
        <div className="space-y-6">
          {!d.members && !d.attendance && !d.finance && <p className="text-sm text-gray-500">Nothing on this dashboard is available for your role.</p>}
          {d.members && <MembersBlockView data={d.members} title="Section members" />}
          {d.attendance && <AttendanceBlockView data={d.attendance} />}
          {d.finance && <Block title="Section finance, last 6 months"><IncomeSpendingBars months={d.finance.months} /></Block>}
        </div>
      )}
    </Shell>
  );
};
