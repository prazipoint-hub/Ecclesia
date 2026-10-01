import { ArrowRight, Building2, FileText, Users } from 'lucide-react';
import { MainLayout } from '@/components/Layout/MainLayout';
import { ScopeBadge } from '@/components/hierarchy/ScopeBadge';
import { useOrganizationStore } from '@/stores/organizationStore';

const districtStats = [
  { label: 'Circuits', value: '12', icon: Building2, tone: 'text-blue-600 bg-blue-50' },
  { label: 'Churches/Congregations*', value: '48', icon: Users, tone: 'text-emerald-600 bg-emerald-50' },
  { label: 'Members', value: '8,420', icon: Users, tone: 'text-violet-600 bg-violet-50' },
  { label: 'Active Programs', value: '36', icon: FileText, tone: 'text-amber-600 bg-amber-50' },
];

const circuitSummaries = [
  { name: 'Cranborne', members: 842 },
  { name: 'Borrowdale', members: 615 },
  { name: 'Mbare', members: 731 },
  { name: 'Chitungwiza', members: 904 },
  { name: 'Glen Norah', members: 680 },
];

const committeeOversight = [
  { name: 'Finance', value: '12/12', tone: 'bg-emerald-50 text-emerald-700' },
  { name: 'Youth', value: '9/12', tone: 'bg-sky-50 text-sky-700' },
  { name: 'Women\'s', value: '11/12', tone: 'bg-pink-50 text-pink-700' },
  { name: 'Property', value: '8/12', tone: 'bg-amber-50 text-amber-700' },
];

const districtPrograms = [
  { name: 'Youth Conference', status: 'Active' },
  { name: 'Leadership Training', status: 'Active' },
  { name: 'Financial Literacy', status: 'Planned' },
];

const reviewItems = ['Cranborne Finance Report', 'Mbare Membership Report', 'Borrowdale Youth Report'];

export const DistrictDashboard = () => {
  const { selectedUnitId } = useOrganizationStore();
  const selectedScope = selectedUnitId === 'district-harare' ? 'Harare District' : 'District';

  return (
    <MainLayout>
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <ScopeBadge type="DISTRICT" />
                <span className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">District overview</span>
              </div>
              <h1 className="mt-3 text-3xl font-bold text-gray-900">{selectedScope}</h1>
              <p className="mt-2 text-gray-600">District Superintendent</p>
            </div>
            <div className="rounded-xl border border-primary-100 bg-primary-50 px-4 py-3 text-right">
              <p className="text-xs uppercase tracking-[0.2em] text-primary-600">Current Scope</p>
              <p className="mt-1 text-xl font-bold text-primary-700">District</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {districtStats.map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-gray-500">{label}</p>
                  <p className="mt-3 text-3xl font-bold text-gray-900">{value}</p>
                </div>
                <div className={`rounded-lg p-2 ${tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Circuits</h2>
              <button className="inline-flex items-center gap-1 text-sm font-medium text-primary-600">
                View all <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              {circuitSummaries.map(({ name, members }) => (
                <div key={name} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                  <span className="font-medium text-gray-800">{name}</span>
                  <span className="text-sm text-gray-600">{members} members</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900">Committee oversight</h2>
            <div className="mt-4 space-y-3">
              {committeeOversight.map(({ name, value, tone }) => (
                <div key={name} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <span className="font-medium text-gray-800">{name}</span>
                  <span className={`rounded-full px-2.5 py-1 text-sm font-semibold ${tone}`}>{value} reports</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900">District programs</h2>
            <div className="mt-4 space-y-3">
              {districtPrograms.map(({ name, status }) => (
                <div key={name} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                  <span className="font-medium text-gray-800">{name}</span>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    {status}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900">Reports requiring review</h2>
            <div className="mt-4 space-y-3">
              {reviewItems.map((item) => (
                <div key={item} className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <span className="font-medium text-gray-800">{item}</span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">Pending</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </MainLayout>
  );
};
