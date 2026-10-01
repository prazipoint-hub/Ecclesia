import { MainLayout } from '@/components/Layout/MainLayout';
import { ScopeBadge } from '@/components/hierarchy/ScopeBadge';
import { useOrganizationStore } from '@/stores/organizationStore';
import { useAuthStore } from '@/stores/authStore';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, Eye, ShieldCheck } from 'lucide-react';

export const SbuDashboard = () => {
  const { sbuId } = useParams<{ sbuId: string }>();
  const navigate = useNavigate();
  const { sbus, getOversightForSbu } = useOrganizationStore();
  const { user } = useAuthStore();
  const sbu = sbus.find((item) => item.id === sbuId);
  const assignment = user?.sbus.find((item) => item.sbuId === sbuId && item.dashboardAccess && item.status === 'ACTIVE');
  const supervisor = sbu ? getOversightForSbu(sbu.id) : undefined;

  if (!sbu) return <MainLayout><p className="text-gray-600">SBU not found.</p></MainLayout>;

  return <MainLayout><div className="mx-auto max-w-6xl space-y-6">
    <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm text-primary-600"><ArrowLeft className="h-4 w-4" />Back</button>
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><ScopeBadge type={sbu.scopeType} /><h1 className="mt-3 text-3xl font-bold text-gray-900">{sbu.name}</h1><p className="mt-2 text-gray-600">{sbu.scopeType} SBU dashboard</p></div><Building2 className="h-8 w-8 text-primary-600" /></div></div>
    {!assignment && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><Eye className="mr-2 inline h-4 w-4" />You are viewing this SBU in oversight/read-only mode. Operational access requires a confirmed SBU assignment.</div>}
    <div className="grid gap-6 md:grid-cols-3"><div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><p className="text-sm text-gray-500">Scope</p><p className="mt-2 text-xl font-bold">{sbu.scopeType}</p></div><div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><p className="text-sm text-gray-500">Operational status</p><p className="mt-2 text-xl font-bold">{assignment ? 'Assigned' : 'Oversight'}</p></div><div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><p className="text-sm text-gray-500">Oversight</p><p className="mt-2 text-xl font-bold">{supervisor?.overseerRole.replace('_', ' ') ?? 'Not configured'}</p></div></div>
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary-600" /><h2 className="text-lg font-semibold">Separation of duties</h2></div><p className="mt-3 text-sm text-gray-600">The SBU operates as a separate business unit. Its confirmed leaders manage SBU operations; the {supervisor?.overseerRole.toLowerCase().replace('_', ' ') ?? 'appointed overseer'} provides oversight and review at this scope.</p></div>
  </div></MainLayout>;
};
