import { Calendar, DollarSign, Users } from 'lucide-react';
import { MainLayout } from '@/components/Layout/MainLayout';

const stats = [
  { label: 'Total members', value: '1,234', icon: Users, tone: 'text-blue-600 bg-blue-50' },
  { label: 'Monthly giving', value: '$12,500', icon: DollarSign, tone: 'text-green-600 bg-green-50' },
  { label: 'Upcoming events', value: '8', icon: Calendar, tone: 'text-purple-600 bg-purple-50' },
];

export const Dashboard = () => (
  <MainLayout>
    <div className="mx-auto max-w-7xl">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary-600">Church overview</p>
        <h1 className="mt-1 text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">A clear view of your church community and operations.</p>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between"><div><p className="text-sm text-gray-500">{label}</p><p className="mt-2 text-3xl font-bold text-gray-900">{value}</p></div><div className={`rounded-lg p-3 ${tone}`}><Icon className="h-6 w-6" /></div></div>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-2"><h2 className="text-lg font-semibold text-gray-900">Recent activity</h2><div className="mt-5 space-y-4"><p className="border-b border-gray-100 pb-4 text-sm text-gray-600"><strong className="text-gray-900">New member registered</strong><br />John Doe joined the church · 2 hours ago</p><p className="border-b border-gray-100 pb-4 text-sm text-gray-600"><strong className="text-gray-900">Offering received</strong><br />Sunday service collection: $2,450 · Yesterday</p><p className="text-sm text-gray-600"><strong className="text-gray-900">Event scheduled</strong><br />Prayer meeting on Friday at 7 PM</p></div></section>
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold text-gray-900">Quick actions</h2><div className="mt-5 space-y-3"><button className="w-full rounded-lg bg-primary-600 px-4 py-2.5 font-medium text-white hover:bg-primary-700">Add member</button><button className="w-full rounded-lg border border-gray-300 px-4 py-2.5 font-medium text-gray-700 hover:bg-gray-50">Record offering</button><button className="w-full rounded-lg border border-gray-300 px-4 py-2.5 font-medium text-gray-700 hover:bg-gray-50">Schedule event</button></div></section>
      </div>
    </div>
  </MainLayout>
);
