import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { ApiError } from '@/pages/finance/financeShared';
import { ErrorBlock, LoadingBlock, PageHeader, card, formatDate, primaryBtn, titleCase } from './shared';
import { apiClient } from '@/utils/api';
import { Dependants, ExtraFields, PhotoControl } from '@/components/profile/ProfileExtras';
import type { ProfileChange, ProfileCompletion } from '@/types/treasury';

const KEY = ['me', 'profile-completion'] as const;
const CHANGES = ['me', 'profile-completion', 'changes'] as const;
const base = '/api/v2/me/profile-completion';
const label = (k: string) => (k.startsWith('extra:') ? titleCase(k.slice(6).replace(/_/g, ' ')) : FIELD_LABEL[k] ?? k);
const FIELD_LABEL: Record<string, string> = { firstName: 'First name', lastName: 'Last name', phone: 'Phone', email: 'Email', dateOfBirth: 'Date of birth', gender: 'Gender', maritalStatus: 'Marital status', address: 'Address', section: 'Section', nextOfKin: 'Next of kin' };

export const ProfileCompletionPage = () => {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: KEY, queryFn: async () => (await apiClient.get<ProfileCompletion>(base)).data });
  const changes = useQuery({ queryKey: CHANGES, queryFn: async () => (await apiClient.get<{ requests: ProfileChange[] }>(`${base}/changes`)).data.requests });
  const [kin, setKin] = useState({ name: '', relationship: '', phone: '', altPhone: '' });
  const [change, setChange] = useState({ field: 'dateOfBirth', value: '' });
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: KEY }); };
  const saveKin = useMutation({
    mutationFn: () => apiClient.put(`${base}/next-of-kin`, { name: kin.name, relationship: kin.relationship, phone: kin.phone, ...(kin.altPhone.trim() && { altPhone: kin.altPhone.trim() }) }),
    onSuccess: refresh,
  });
  const request = useMutation({
    mutationFn: () => apiClient.post(`${base}/changes`, change),
    onSuccess: () => { setChange({ ...change, value: '' }); void queryClient.invalidateQueries({ queryKey: CHANGES }); },
  });
  const s = status.data;

  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader title="Complete your profile" subtitle="Your church decides which details are required. The percentage below follows that rule." />
        {status.isLoading ? <LoadingBlock /> : status.error || !s ? <ErrorBlock error={status.error} onRetry={() => void status.refetch()} /> : (
          <>
            <section className={card} aria-label="Progress">
              <div className="flex items-baseline justify-between"><h2 className="text-lg font-semibold text-gray-900">{s.percent}% complete</h2><span className="text-xs text-gray-500">{s.ruleSource === 'church' ? 'Your church’s rule' : 'Default rule'}</span></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={s.percent} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-primary-600" style={{ width: `${s.percent}%` }} /></div>
              {s.missing.length ? <p className="mt-3 text-sm text-gray-700">Still needed: {s.missing.map(label).join(', ')}.</p> : <p className="mt-3 text-sm text-green-700">Everything your church requires is filled in.</p>}
            </section>
            <section className={card} aria-label="Photo"><h2 className="mb-3 text-lg font-semibold text-gray-900">Photo</h2><PhotoControl /></section>
            <ExtraFields />
            <Dependants />

            <section className={card}>
              <h2 className="mb-1 text-lg font-semibold text-gray-900">Next of kin</h2>
              {s.nextOfKin && <p className="mb-3 text-sm text-gray-600">On file: {s.nextOfKin.name} ({s.nextOfKin.relationship}), {s.nextOfKin.phone}. Enter new details below to replace them.</p>}
              {saveKin.error && <ApiError error={saveKin.error} />}
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Full name" value={kin.name} onChange={(e) => setKin({ ...kin, name: e.target.value })} />
                <FormField label="Relationship" value={kin.relationship} onChange={(e) => setKin({ ...kin, relationship: e.target.value })} />
                <FormField label="Phone" value={kin.phone} onChange={(e) => setKin({ ...kin, phone: e.target.value })} />
                <FormField label="Other phone (optional)" value={kin.altPhone} onChange={(e) => setKin({ ...kin, altPhone: e.target.value })} />
              </div>
              <button type="button" className={`${primaryBtn} mt-3`} disabled={saveKin.isPending || kin.name.trim().length < 2 || kin.relationship.trim().length < 2 || kin.phone.trim().length < 5} onClick={() => saveKin.mutate()}>{saveKin.isPending ? 'Saving…' : 'Save next of kin'}</button>
            </section>

            <section className={card}>
              <h2 className="mb-1 text-lg font-semibold text-gray-900">Request a correction</h2>
              <p className="mb-3 text-sm text-gray-600">Date of birth, gender and marital status are checked by a church officer before they change. Phone, address and email you can edit directly on your profile.</p>
              {request.error && <ApiError error={request.error} />}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium text-gray-700">Detail
                  <select className="mt-1 block w-full rounded-lg border-gray-300" value={change.field} onChange={(e) => setChange({ field: e.target.value, value: '' })}>
                    <option value="dateOfBirth">Date of birth</option><option value="gender">Gender</option><option value="maritalStatus">Marital status</option>
                  </select>
                </label>
                {change.field === 'dateOfBirth' ? <FormField type="date" label="Correct value" value={change.value} onChange={(e) => setChange({ ...change, value: e.target.value })} />
                  : <label className="block text-sm font-medium text-gray-700">Correct value
                    <select className="mt-1 block w-full rounded-lg border-gray-300" value={change.value} onChange={(e) => setChange({ ...change, value: e.target.value })}>
                      <option value="">Choose…</option>
                      {(change.field === 'gender' ? ['MALE', 'FEMALE'] : ['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED']).map((v) => <option key={v} value={v}>{titleCase(v)}</option>)}
                    </select></label>}
              </div>
              <button type="button" className={`${primaryBtn} mt-3`} disabled={!change.value || request.isPending} onClick={() => request.mutate()}>Submit for review</button>
              <h3 className="mb-2 mt-5 text-sm font-semibold text-gray-700">Your requests</h3>
              {changes.data?.length ? (
                <ul className="space-y-2 text-sm">{changes.data.map((r) => (
                  <li key={r.id} className="rounded-lg border border-gray-200 p-3">
                    {FIELD_LABEL[r.field] ?? r.field}: <strong>{r.status.toLowerCase()}</strong> <span className="text-gray-500">({formatDate(r.createdAt)})</span>
                    {r.reviewNote && <p className="mt-1 text-gray-600">Reviewer: {r.reviewNote}</p>}
                  </li>))}</ul>
              ) : <p className="text-sm text-gray-500">No requests yet.</p>}
            </section>
          </>
        )}
      </div>
    </MainLayout>
  );
};
