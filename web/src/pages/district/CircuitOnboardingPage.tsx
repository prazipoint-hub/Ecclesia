import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { EmptyBlock, ErrorBlock, LoadingBlock, card, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { AdminHeader } from '@/pages/admin/adminShared';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { usePermissions } from '@/pages/finance/financeShared';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';

const H = '/api/v2/hierarchy';
interface Circuit { id: string; name: string; location: string | null; status: string; district: { id: string; name: string } | null; conference: { id: string; name: string } | null }
interface Units { conferences: Array<{ id: string; name: string }>; districts: Array<{ id: string; name: string; conferenceId: string | null }> }
interface Step { step: string; title: string; kind: 'confirm' | 'derived'; confirmed: boolean; ready: boolean; done: boolean; blockers: string[]; counts?: Record<string, number> }
interface Onboarding { circuitId: string; completedAt: string | null; progress: { done: number; total: number }; steps: Step[]; canComplete: boolean }
const STEP_LINK: Record<string, { to: string; text: string }> = {
  MEMBERSHIP: { to: '/members/import-jobs', text: 'Import members' },
  LEADERSHIP: { to: '/leadership/register', text: 'Open leadership register' },
  ACCESS: { to: '/admin/access', text: 'Review access' },
};
const newKey = () => `reg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const Checklist = ({ circuitId }: { circuitId: string }) => {
  const has = usePermissions();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['onboarding', circuitId], queryFn: async () => (await apiClient.get<Onboarding>(`${H}/circuits/${circuitId}/onboarding`)).data });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['onboarding', circuitId] });
  const confirm = useMutation({ mutationFn: (step: string) => apiClient.post(`${H}/circuits/${circuitId}/onboarding/steps/${step.toLowerCase()}/confirm`), onSuccess: refresh });
  const complete = useMutation({ mutationFn: () => apiClient.post(`${H}/circuits/${circuitId}/onboarding/complete`), onSuccess: refresh });
  if (q.isLoading) return <LoadingBlock />;
  if (q.error || !q.data) return <ErrorBlock error={q.error} />;
  const o = q.data;
  return (
    <div className="mt-3 space-y-2" aria-label="Onboarding checklist">
      <p className="text-sm text-gray-600">{o.completedAt ? 'Onboarding complete.' : `${o.progress.done} of ${o.progress.total} steps done.`}</p>
      {(confirm.error || complete.error) && <ErrorNotice message={getApiErrorMessage(confirm.error ?? complete.error)} />}
      <ul className="space-y-2">
        {o.steps.map((s) => (
          <li key={s.step} className="rounded-lg border border-gray-200 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-gray-900">{s.done ? '✓ ' : ''}{s.title}{s.counts && <span className="ml-2 text-xs text-gray-500">{Object.entries(s.counts).map(([k, v]) => `${v} ${k}`).join(', ')}</span>}</span>
              <span className="flex gap-2">
                {STEP_LINK[s.step] && !o.completedAt && <Link className={secondaryBtn} to={STEP_LINK[s.step].to}>{STEP_LINK[s.step].text}</Link>}
                {s.kind === 'confirm' && !s.done && !o.completedAt && has('circuit:onboard') && <button type="button" className={primaryBtn} disabled={!s.ready || confirm.isPending} onClick={() => confirm.mutate(s.step)}>Confirm</button>}
              </span>
            </div>
            {s.blockers.length > 0 && !s.done && <p className="mt-1 text-amber-800">Still needed: {s.blockers.join('; ')}</p>}
          </li>
        ))}
      </ul>
      {!o.completedAt && <button type="button" className={primaryBtn} disabled={!o.canComplete || complete.isPending} onClick={() => complete.mutate()}>Complete onboarding</button>}
    </div>
  );
};

export const CircuitOnboardingPage = () => {
  const qc = useQueryClient();
  const circuits = useQuery({ queryKey: ['circuits'], retry: false, queryFn: async () => (await apiClient.get<{ circuits: Circuit[] }>(`${H}/circuits`, { params: { take: 100 } })).data.circuits });
  const units = useQuery({ queryKey: ['units'], retry: false, queryFn: async () => (await apiClient.get<Units>(`${H}/units`)).data });
  const [open, setOpen] = useState<string | null>(null);
  const [key] = useState(newKey);
  const [f, setF] = useState({ name: '', conferenceId: '', districtId: '', location: '', churchName: '', first: '', last: '', email: '', phone: '' });
  const districts = useMemo(() => (units.data?.districts ?? []).filter((d) => !f.conferenceId || d.conferenceId === f.conferenceId), [units.data, f.conferenceId]);
  const register = useMutation({
    mutationFn: async () => (await apiClient.post<{ created: boolean; circuit: Circuit }>(`${H}/circuits`, {
      name: f.name, conferenceId: f.conferenceId, districtId: f.districtId, ...(f.location.trim() && { location: f.location.trim() }),
      firstChurch: { name: f.churchName }, secretary: { firstName: f.first, lastName: f.last, email: f.email, ...(f.phone.trim() && { phone: f.phone.trim() }) },
    }, { headers: { 'Idempotency-Key': key } })).data,
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ['circuits'] }); setOpen(r.circuit.id); },
  });
  const resend = useMutation({ mutationFn: (id: string) => apiClient.post(`${H}/circuits/${id}/secretary-invitation`) });
  const canRegister = (units.data?.districts.length ?? 0) > 0;
  const ready = f.name.trim().length >= 2 && f.conferenceId && f.districtId && f.churchName.trim().length >= 2 && f.first.trim() && f.last.trim() && /\S+@\S+\.\S+/.test(f.email);

  return (
    <MainLayout>
      <div className="mx-auto max-w-5xl space-y-6">
        <AdminHeader title="Circuits" subtitle="Register a circuit with its first church and Secretary, then work through onboarding. Each step is checked against real records." />
        {canRegister && (
          <section className={card}>
            <h2 className="mb-3 text-lg font-medium text-gray-900">Register a circuit</h2>
            {register.error && <ErrorNotice message={getApiErrorMessage(register.error)} />}
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Circuit name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              <FormField label="Location" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
              <label className="block text-sm font-medium text-gray-700">Conference
                <select className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" value={f.conferenceId} onChange={(e) => setF({ ...f, conferenceId: e.target.value, districtId: '' })}>
                  <option value="">Choose…</option>{units.data?.conferences.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium text-gray-700">District
                <select className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" value={f.districtId} onChange={(e) => setF({ ...f, districtId: e.target.value })}>
                  <option value="">Choose…</option>{districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
              <FormField label="First church or preaching point" value={f.churchName} onChange={(e) => setF({ ...f, churchName: e.target.value })} />
              <span />
              <FormField label="Secretary first name" value={f.first} onChange={(e) => setF({ ...f, first: e.target.value })} />
              <FormField label="Secretary last name" value={f.last} onChange={(e) => setF({ ...f, last: e.target.value })} />
              <FormField type="email" label="Secretary email (invitation is sent here)" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
              <FormField label="Secretary phone (optional)" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            </div>
            <button type="button" className={`${primaryBtn} mt-3`} disabled={!ready || register.isPending} onClick={() => register.mutate()}>{register.isPending ? 'Registering…' : 'Register circuit'}</button>
          </section>
        )}
        <section className={card}>
          <h2 className="mb-3 text-lg font-medium text-gray-900">Your circuits</h2>
          {resend.error && <ErrorNotice message={getApiErrorMessage(resend.error)} />}
          {circuits.isLoading ? <LoadingBlock /> : circuits.error ? <ErrorBlock error={circuits.error} /> : !circuits.data?.length ? <EmptyBlock message="No circuits to show." /> : (
            <ul className="space-y-3">
              {circuits.data.map((c) => (
                <li key={c.id} className="rounded-md border border-gray-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><p className="font-medium text-gray-900">{c.name} <span className="text-xs font-normal text-gray-500">{c.status.toLowerCase()}</span></p><p className="text-sm text-gray-500">{[c.district?.name, c.conference?.name, c.location].filter(Boolean).join(' · ')}</p></div>
                    <span className="flex gap-2">
                      <button type="button" className={secondaryBtn} onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? 'Hide onboarding' : 'Onboarding'}</button>
                      {canRegister && <button type="button" className={secondaryBtn} disabled={resend.isPending} onClick={() => resend.mutate(c.id)}>Resend Secretary invitation</button>}
                    </span>
                  </div>
                  {open === c.id && <Checklist circuitId={c.id} />}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </MainLayout>
  );
};
