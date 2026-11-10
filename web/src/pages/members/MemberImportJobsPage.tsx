import { MainLayout } from '@/components/Layout/MainLayout';
import { ImportJobPanel } from '@/components/imports/ImportJobPanel';
import { AdminHeader, NoAccess } from '@/pages/admin/adminShared';
import { useAuthStore } from '@stores/authStore';
import { can } from '@/types/people';

export const MemberImportJobsPage = () => {
  const allowed = can(useAuthStore((s) => s.user?.permissions), 'member:import');
  return (
    <MainLayout>
      <div className="mx-auto max-w-5xl space-y-6">
        <AdminHeader title="Import members (checked first)" subtitle="Upload, review problems and possible duplicates, then confirm. A failed row never blocks the others." />
        {allowed ? <ImportJobPanel kind="MEMBER" base="/api/v2/members/import-jobs" templateUrl="/api/v2/members/import-jobs/template" templateName="ecclesia-member-template.csv" /> : <NoAccess permission="member:import" />}
      </div>
    </MainLayout>
  );
};
