import { ArrowRight, Building2, FileText, ListChecks, ShieldCheck } from 'lucide-react';
import { MainLayout } from '@/components/Layout/MainLayout';
import { ScopeBadge } from '@/components/hierarchy/ScopeBadge';

const circuits = [
  { name: 'Cranborne', members: 842, reporting: '88%' },
  { name: 'Borrowdale', members: 615, reporting: '72%' },
  { name: 'Mbare', members: 731, reporting: '90%' },
  { name: 'Chitungwiza', members: 904, reporting: '84%' },
];

export const DistrictCircuits = () => (
  <MainLayout>
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <ScopeBadge type="DISTRICT" />
            <span className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">District structure</span>
          </div>
          <h1 className="mt-3 text-3xl font-bold text-gray-900">Circuits</h1>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {circuits.map(({ name, members, reporting }) => (
          <div key={name} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">{name}</h2>
              <Building2 className="h-5 w-5 text-primary-600" />
            </div>
            <p className="mt-4 text-3xl font-bold text-gray-900">{members}</p>
            <p className="mt-1 text-sm text-gray-500">Members</p>
            <div className="mt-4 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
              <span className="text-sm text-gray-600">Reporting</span>
              <span className="font-medium text-primary-700">{reporting}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Circuit overview</h2>
          <button className="inline-flex items-center gap-1 text-sm font-medium text-primary-600">
            Manage circuits <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          {['Cranborne', 'Borrowdale', 'Mbare', 'Chitungwiza'].map((circuit) => (
            <div key={circuit} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-3">
              <span className="font-medium text-gray-800">{circuit}</span>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <ListChecks className="h-4 w-4" />
                4 district activities
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </MainLayout>
);
