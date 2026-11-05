import { ArrowLeft, Building2, Eye, ShieldCheck, UserCheck, UsersRound } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { MainLayout } from '@/components/Layout/MainLayout';
import { ScopeBadge } from '@/components/hierarchy/ScopeBadge';
import { useAuthStore } from '@/stores/authStore';
import { useOrganizationStore } from '@/stores/organizationStore';

export const SbuDashboard = () => {
  const { sbuId } = useParams<{ sbuId: string }>();
  const navigate = useNavigate();
  const { sbus, getOversightForSbu } = useOrganizationStore();
  const { user } = useAuthStore();
  const sbu = sbus.find((item) => item.id === sbuId);
  const assignment = user?.sbus.find((item) => item.sbuId === sbuId && item.dashboardAccess && item.status === 'ACTIVE');
  const supervisor = sbu ? getOversightForSbu(sbu.id) : undefined;

  if (!sbu) {
    return <MainLayout><div role="alert" className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-900 shadow-sm"><Building2 className="mx-auto h-7 w-7" /><h1 className="mt-3 text-xl font-semibold">SBU not found</h1><p className="mt-2 text-sm">This business unit may have moved or you may no longer have access.</p><button type="button" onClick={() => navigate(-1)} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold"><ArrowLeft className="h-4 w-4" /> Go back</button></div></MainLayout>;
  }

  const oversightLabel = supervisor?.overseerRole.replace(/_/g, ' ') ?? 'Not configured';

  return (
    <MainLayout>
      <div className="mx-auto max-w-6xl space-y-7">
        <button type="button" onClick={() => navigate(-1)} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-primary-700 hover:bg-primary-50"><ArrowLeft className="h-4 w-4" /> Back</button>

        <header className="relative overflow-hidden rounded-3xl bg-primary-950 p-6 text-white shadow-lift sm:p-8">
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.2),transparent_18rem),radial-gradient(circle_at_bottom_left,rgba(124,58,237,0.55),transparent_28rem)]" />
          <div className="relative flex flex-wrap items-start justify-between gap-5">
            <div><ScopeBadge type={sbu.scopeType} /><p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-primary-200">Separate business unit</p><h1 className="mt-2 text-3xl font-semibold sm:text-4xl">{sbu.name}</h1><p className="mt-2 text-primary-100">{sbu.scopeType} SBU workspace and oversight dashboard.</p></div>
            <span className="rounded-2xl bg-white/10 p-4 text-amber-300 ring-1 ring-white/15"><Building2 className="h-8 w-8" /></span>
          </div>
        </header>

        {!assignment && <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm"><span className="rounded-xl bg-amber-100 p-2"><Eye className="h-4 w-4" /></span><div><p className="font-semibold">Oversight mode</p><p className="mt-1 text-amber-800">You can review this SBU, but operational actions require a confirmed active assignment.</p></div></div>}

        <section aria-label="SBU access summary" className="grid gap-4 md:grid-cols-3">
          {[
            { label: 'Organizational scope', value: sbu.scopeType, icon: UsersRound },
            { label: 'Access mode', value: assignment ? 'Assigned' : 'Oversight', icon: UserCheck },
            { label: 'Oversight role', value: oversightLabel, icon: ShieldCheck },
          ].map(({ label, value, icon: Icon }) => (
            <article key={label} className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-soft"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-gray-500">{label}</p><p className="mt-2 text-lg font-semibold capitalize text-gray-950">{value.toLowerCase()}</p></div><span className="rounded-xl bg-primary-50 p-2.5 text-primary-700"><Icon className="h-5 w-5" /></span></div></article>
          ))}
        </section>

        <section className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-soft sm:p-6" aria-labelledby="duties-heading">
          <div className="flex items-start gap-4"><span className="rounded-xl bg-green-50 p-3 text-green-700"><ShieldCheck className="h-5 w-5" /></span><div><h2 id="duties-heading" className="text-lg font-semibold text-gray-950">Separation of duties</h2><p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-600">The SBU operates as a separate business unit. Confirmed leaders manage its operations, while the {supervisor?.overseerRole.toLowerCase().replace(/_/g, ' ') ?? 'appointed overseer'} provides governance and review at this scope.</p></div></div>
        </section>
      </div>
    </MainLayout>
  );
};
