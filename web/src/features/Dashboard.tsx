import { ArrowRight, CalendarDays, CircleDollarSign, HeartHandshake, Sparkles, TrendingUp, UserPlus, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/Layout/MainLayout';

const stats = [
  { label: 'Active members', value: '1,234', change: '+4.8%', icon: Users, tone: 'text-primary-700 bg-primary-50' },
  { label: 'Monthly giving', value: '$12,500', change: '+8.2%', icon: CircleDollarSign, tone: 'text-emerald-700 bg-emerald-50' },
  { label: 'Upcoming events', value: '8', change: 'Next in 2 days', icon: CalendarDays, tone: 'text-amber-700 bg-amber-50' },
  { label: 'Care follow-ups', value: '14', change: '5 due today', icon: HeartHandshake, tone: 'text-rose-700 bg-rose-50' },
];

const activity = [
  { title: 'New member registered', detail: 'John Doe joined the church', time: '2 hours ago', icon: UserPlus, tone: 'bg-primary-50 text-primary-700' },
  { title: 'Offering received', detail: 'Sunday service collection · $2,450', time: 'Yesterday', icon: CircleDollarSign, tone: 'bg-emerald-50 text-emerald-700' },
  { title: 'Event scheduled', detail: 'Prayer meeting · Friday at 7:00 PM', time: 'Yesterday', icon: CalendarDays, tone: 'bg-amber-50 text-amber-700' },
];

export const Dashboard = () => (
  <MainLayout>
    <div className="mx-auto max-w-[1440px]">
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="page-eyebrow">Church overview</p>
          <h1 className="mt-2 text-2xl font-medium text-gray-950 sm:text-2xl">Good morning</h1>
          <p className="mt-2 max-w-2xl text-gray-600">Here’s what is happening across your church community today.</p>
        </div>
        <p className="w-fit rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm">
          {new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, change, icon: Icon, tone }) => (
          <div key={label} className="group rounded-lg border border-gray-200/80 bg-white p-5 shadow-card transition-shadow hover:shadow-lg">
            <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-medium text-gray-500">{label}</p><p className="mt-2 font-display text-2xl font-medium text-gray-950">{value}</p></div><div className={`rounded-md p-3 ${tone}`}><Icon className="h-5 w-5" /></div></div>
            <p className="mt-4 flex items-center gap-1.5 text-xs font-medium text-gray-500"><TrendingUp className="h-3.5 w-3.5 text-emerald-600" />{change}<span className="font-normal text-gray-400">this month</span></p>
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <section className="rounded-lg border border-gray-200/80 bg-white shadow-card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 sm:px-6"><div><h2 className="text-lg font-medium text-gray-950">Recent activity</h2><p className="mt-0.5 text-sm text-gray-500">The latest updates from your workspace</p></div><Link to="/reports" className="text-sm font-medium text-primary-700 hover:text-primary-800">View reports</Link></div>
          <div className="divide-y divide-gray-100 px-5 sm:px-6">{activity.map(({ title, detail, time, icon: Icon, tone }) => <div key={title} className="flex items-center gap-4 py-4"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${tone}`}><Icon className="h-4.5 w-4.5" /></span><div className="min-w-0 flex-1"><p className="font-medium text-gray-900">{title}</p><p className="truncate text-sm text-gray-500">{detail}</p></div><span className="hidden text-xs font-medium text-gray-400 sm:block">{time}</span></div>)}</div>
        </section>
        <section className="relative overflow-hidden rounded-lg bg-navy-900 p-6 text-white shadow-lg">
          <Sparkles className="relative h-6 w-6 text-primary-200" /><h2 className="relative mt-4 text-xl font-medium">Quick actions</h2><p className="relative mt-1 text-sm leading-relaxed text-primary-100/75">Keep daily administration moving.</p>
          <div className="relative mt-6 space-y-2"><Link to="/members" className="flex h-9 items-center justify-between rounded-md bg-white px-4 text-sm font-medium text-primary-900 shadow-sm">Add a member<ArrowRight className="h-4 w-4" /></Link><Link to="/finance" className="flex h-9 items-center justify-between rounded-md bg-white/10 px-4 text-sm font-medium text-white hover:bg-white/15">Record an offering<ArrowRight className="h-4 w-4" /></Link><Link to="/events" className="flex h-9 items-center justify-between rounded-md bg-white/10 px-4 text-sm font-medium text-white hover:bg-white/15">Schedule an event<ArrowRight className="h-4 w-4" /></Link></div>
        </section>
      </div>
    </div>
  </MainLayout>
);
