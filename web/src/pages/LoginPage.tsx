import { HeartHandshake, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { LoginForm } from '@/components/auth/LoginForm';

export const LoginPage = () => (
  <main className="grid min-h-screen bg-gray-50 lg:grid-cols-[1.05fr_0.95fr]">
    <section className="relative hidden overflow-hidden bg-navy-900 p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary-500/25 blur-3xl" />
      <div className="absolute -bottom-24 right-0 h-80 w-80 rounded-full bg-accent-500/15 blur-3xl" />
      <div className="relative flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-white/10 ring-1 ring-white/15"><Sparkles className="h-5 w-5 text-primary-200" /></span><div><p className="font-display text-xl font-medium">Ecclesia</p><p className="text-xs uppercase tracking-[0.18em] text-primary-200">Church ERP</p></div></div>
      <div className="relative max-w-xl"><p className="text-sm font-medium uppercase tracking-[0.2em] text-primary-200">Serve people. Steward well.</p><h1 className="mt-5 font-display text-2xl font-medium leading-tight xl:text-5xl">One calm place for the work that supports your ministry.</h1><p className="mt-6 max-w-lg text-lg leading-relaxed text-primary-100/75">Bring members, pastoral care, events, finance and reporting together in a secure workspace built for church teams.</p><div className="mt-10 grid grid-cols-3 gap-3"><Trust icon={Users} label="People" /><Trust icon={HeartHandshake} label="Care" /><Trust icon={ShieldCheck} label="Secure" /></div></div>
      <p className="relative text-sm text-primary-200/70">Purpose-built church operations</p>
    </section>
    <section className="flex items-center justify-center px-4 py-10 sm:px-8"><LoginForm /></section>
  </main>
);

const Trust = ({ icon: Icon, label }: { icon: typeof Users; label: string }) => <div className="rounded-md border border-white/10 bg-white/[0.06] p-4"><Icon className="h-5 w-5 text-primary-200" /><p className="mt-2 text-sm font-medium">{label}</p></div>;
