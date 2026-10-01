import { CalendarRange, ArrowRight } from 'lucide-react';
import { MainLayout } from '@/components/Layout/MainLayout';
import { ScopeBadge } from '@/components/hierarchy/ScopeBadge';

const programs = [
  { name: 'Youth Conference', status: 'Active', committee: 'District Youth Committee' },
  { name: 'Leadership Training', status: 'Active', committee: 'District Church Leadership' },
  { name: 'Financial Literacy', status: 'Planned', committee: 'District Finance Committee' },
  { name: 'Women\'s Program', status: 'Active', committee: 'District Women\'s Committee' },
];

export const DistrictPrograms = () => (
  <MainLayout>
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <ScopeBadge type="DISTRICT" />
            <span className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">Programs</span>
          </div>
          <h1 className="mt-3 text-3xl font-bold text-gray-900">District programs</h1>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {programs.map(({ name, status, committee }) => (
          <div key={name} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">{name}</h2>
              <CalendarRange className="h-5 w-5 text-primary-600" />
            </div>
            <div className="mt-4 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700 inline-block">
              {status}
            </div>
            <p className="mt-4 text-sm text-gray-600">{committee}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Program delivery</h2>
          <button className="inline-flex items-center gap-1 text-sm font-medium text-primary-600">
            View full program pipeline <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          {['Youth Conference', 'Leadership Training', 'Financial Literacy'].map((program) => (
            <div key={program} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-3">
              <span className="font-medium text-gray-800">{program}</span>
              <span className="text-sm text-gray-600">Active delivery</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </MainLayout>
);
