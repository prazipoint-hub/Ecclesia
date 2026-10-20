import { FileSpreadsheet, ArrowRight } from 'lucide-react';
import { MainLayout } from '@/components/Layout/MainLayout';
import { ScopeBadge } from '@/components/hierarchy/ScopeBadge';

const reports = [
  { name: 'Cranborne Finance Report', status: 'Pending review' },
  { name: 'Mbare Membership Report', status: 'Pending review' },
  { name: 'Borrowdale Youth Report', status: 'Queued' },
  { name: 'District Quarterly Report', status: 'Published' },
];

export const DistrictReports = () => (
  <MainLayout>
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <ScopeBadge type="DISTRICT" />
            <span className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">Reporting</span>
          </div>
          <h1 className="mt-3 text-3xl font-bold text-gray-900">District reports</h1>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {reports.map(({ name, status }) => (
          <div key={name} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">{name}</h2>
              <FileSpreadsheet className="h-5 w-5 text-primary-600" />
            </div>
            <div className="mt-4 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
              <span className="text-sm text-gray-600">Status</span>
              <span className="text-sm font-semibold text-gray-800">{status}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Report actions</h2>
          <button className="inline-flex items-center gap-1 text-sm font-medium text-primary-600">
            Download analytics <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          {['District financial analytics', 'Circuit attendance summary', 'Membership movement report'].map((item) => (
            <div key={item} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-3">
              <span className="font-medium text-gray-800">{item}</span>
              <span className="text-sm text-gray-500">Ready</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </MainLayout>
);
