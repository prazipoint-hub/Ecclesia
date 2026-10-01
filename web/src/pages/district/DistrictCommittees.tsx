import { BriefcaseBusiness, ArrowRight } from 'lucide-react';
import { MainLayout } from '@/components/Layout/MainLayout';
import { ScopeBadge } from '@/components/hierarchy/ScopeBadge';

const committees = [
  { name: 'Finance', reports: '12/12', scope: 'District-wide' },
  { name: 'Youth', reports: '9/12', scope: 'District-wide' },
  { name: 'Women\'s', reports: '11/12', scope: 'District-wide' },
  { name: 'Property', reports: '8/12', scope: 'District-wide' },
];

export const DistrictCommittees = () => (
  <MainLayout>
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <ScopeBadge type="DISTRICT" />
            <span className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">Governance</span>
          </div>
          <h1 className="mt-3 text-3xl font-bold text-gray-900">Committees</h1>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {committees.map(({ name, reports, scope }) => (
          <div key={name} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">{name}</h2>
              <BriefcaseBusiness className="h-5 w-5 text-primary-600" />
            </div>
            <p className="mt-5 text-3xl font-bold text-gray-900">{reports}</p>
            <p className="mt-1 text-sm text-gray-500">Reports submitted</p>
            <div className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">{scope}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Committee oversight</h2>
          <button className="inline-flex items-center gap-1 text-sm font-medium text-primary-600">
            Review committee assignments <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          {['Finance oversees circuit finance committees', 'Youth oversees circuit youth committees', 'Women\'s oversees circuit women\'s committees'].map((item) => (
            <div key={item} className="rounded-lg bg-gray-50 px-3 py-3 text-gray-800">{item}</div>
          ))}
        </div>
      </div>
    </div>
  </MainLayout>
);
