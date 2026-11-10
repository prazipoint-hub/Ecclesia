import { ArrowRight, Building2, CheckCircle2, ListChecks, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/Layout/MainLayout';
import { ScopeBadge } from '@/components/hierarchy/ScopeBadge';

const circuits = [
  { name: 'Cranborne', members: 842, reporting: 88, activities: 4 },
  { name: 'Borrowdale', members: 615, reporting: 72, activities: 4 },
  { name: 'Mbare', members: 731, reporting: 90, activities: 4 },
  { name: 'Chitungwiza', members: 904, reporting: 84, activities: 4 },
];

export const DistrictCircuits = () => {
  const totalMembers = circuits.reduce((sum, circuit) => sum + circuit.members, 0);
  const averageReporting = Math.round(circuits.reduce((sum, circuit) => sum + circuit.reporting, 0) / circuits.length);

  return (
    <MainLayout>
      <div className="mx-auto max-w-6xl space-y-7">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3"><ScopeBadge type="DISTRICT" /><span className="page-eyebrow">District structure</span></div>
            <h1 className="mt-3 text-2xl font-medium text-gray-950 sm:text-2xl">Circuits</h1>
            <p className="mt-2 max-w-2xl text-gray-600">Monitor circuit membership, reporting health and district activity.</p>
          </div>
          <Link to="/district/management" className="inline-flex h-9 items-center gap-2 rounded-md bg-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary-700 hover:shadow-md">
            Manage structure <ArrowRight className="h-4 w-4" />
          </Link>
        </header>

        <section aria-label="Circuit summary" className="grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Active circuits', value: circuits.length.toString(), icon: Building2 },
            { label: 'Members represented', value: totalMembers.toLocaleString(), icon: UsersRound },
            { label: 'Average reporting', value: `${averageReporting}%`, icon: CheckCircle2 },
          ].map(({ label, value, icon: Icon }) => (
            <article key={label} className="rounded-lg border border-gray-200/80 bg-white p-5 shadow-card">
              <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-gray-500">{label}</p><p className="mt-2 text-2xl font-medium text-gray-950">{value}</p></div><span className="rounded-md bg-primary-50 p-2.5 text-primary-700"><Icon className="h-5 w-5" /></span></div>
            </article>
          ))}
        </section>

        <section aria-labelledby="circuit-overview-heading" className="rounded-lg border border-gray-200/80 bg-white shadow-card">
          <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-5 py-4 sm:px-6">
            <div><h2 id="circuit-overview-heading" className="text-lg font-medium text-gray-950">Circuit overview</h2><p className="mt-1 text-sm text-gray-500">Current district units and reporting completion.</p></div>
            <span className="rounded-md bg-primary-50 p-2.5 text-primary-700"><ListChecks className="h-5 w-5" /></span>
          </div>
          <div className="divide-y divide-gray-100">
            {circuits.map((circuit) => (
              <article key={circuit.name} className="grid gap-4 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_9rem_10rem] sm:items-center sm:px-6">
                <div><h3 className="font-medium text-gray-950">{circuit.name}</h3><p className="mt-1 text-sm text-gray-500">{circuit.members.toLocaleString()} members · {circuit.activities} district activities</p></div>
                <div className="text-sm sm:text-right"><span className="font-medium text-gray-900">{circuit.reporting}%</span><span className="ml-1 text-gray-500">reported</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-label={`${circuit.name} reporting`} aria-valuenow={circuit.reporting} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-primary-600" style={{ width: `${circuit.reporting}%` }} /></div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </MainLayout>
  );
};
