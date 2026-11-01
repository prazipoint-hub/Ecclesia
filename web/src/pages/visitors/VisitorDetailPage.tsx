import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { FormSelect } from '@/components/forms/FormSelect';
import { FormTextarea } from '@/components/forms/FormTextarea';
import { Modal } from '@/components/forms/Modal';
import { ErrorBlock, LoadingBlock, formatDate, primaryBtn, secondaryBtn, titleCase } from '@/pages/account/shared';
import { NoAccess } from '@/pages/admin/adminShared';
import { SuccessNotice } from '@/pages/auth/AuthShell';
import { BackLink, Badge, FormError, Header } from '@/pages/members/peopleShared';
import { useSections } from '@/pages/members/useSections';
import { useAuthStore } from '@stores/authStore';
import { apiClient } from '@/utils/api';
import { can, toDateInput, type ConvertResult, type FollowUpMethod, type Visitor } from '@/types/people';
import { VISITORS_KEY } from './VisitorsPage';

const METHODS: FollowUpMethod[] = ['CALL', 'VISIT', 'MESSAGE', 'OTHER'];

const Row = ({ label, value }: { label: string; value: string | null | undefined }) => (
  <div>
    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
    <dd className="mt-1 break-words text-gray-900">{value || '—'}</dd>
  </div>
);

export const VisitorDetailPage = () => {
  const { id = '' } = useParams();
  const permissions = useAuthStore((s) => s.user?.permissions);
  const allowed = can(permissions, 'visitor:view');
  const canManage = can(permissions, 'visitor:manage');
  const canConvert = canManage && can(permissions, 'member:create');
  const queryClient = useQueryClient();
  const key = [...VISITORS_KEY, 'detail', id];
  const sections = useSections(allowed && canConvert);

  const visitor = useQuery({ queryKey: key, enabled: allowed && Boolean(id), queryFn: async () => (await apiClient.get<Visitor>(`/api/v2/visitors/${id}`)).data });
  const refresh = () => queryClient.invalidateQueries({ queryKey: VISITORS_KEY });

  // follow-up form
  const [method, setMethod] = useState<FollowUpMethod>('CALL');
  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState('');
  const followUp = useMutation({
    mutationFn: async () => (await apiClient.post(`/api/v2/visitors/${id}/follow-ups`, { method, ...(notes.trim() ? { notes: notes.trim() } : {}), ...(outcome ? { status: outcome } : {}) })).data,
    onSuccess: async () => { setNotes(''); setOutcome(''); await refresh(); },
  });

  // conversion
  const [converting, setConverting] = useState(false);
  const [sectionId, setSectionId] = useState('');
  const [gender, setGender] = useState('');
  const [dob, setDob] = useState('');
  const [converted, setConverted] = useState<ConvertResult['member'] | null>(null);
  const convert = useMutation({
    mutationFn: async () =>
      (await apiClient.post<ConvertResult>(`/api/v2/visitors/${id}/convert`, { ...(sectionId ? { sectionId } : {}), ...(gender ? { gender } : {}), ...(dob ? { dateOfBirth: new Date(dob).toISOString() } : {}) })).data,
    onSuccess: async (data) => { setConverted(data.member); setConverting(false); await refresh(); },
  });

  // edit
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ firstName: '', lastName: '', phone: '', email: '', source: '', notes: '' });
  const update = useMutation({
    mutationFn: async () => {
      const nullable = (v: string) => (v.trim() === '' ? null : v.trim());
      return (await apiClient.put(`/api/v2/visitors/${id}`, { firstName: edit.firstName.trim(), lastName: edit.lastName.trim(), phone: nullable(edit.phone), email: nullable(edit.email), source: nullable(edit.source), notes: nullable(edit.notes) })).data;
    },
    onSuccess: async () => { setEditing(false); await refresh(); },
  });

  const v = visitor.data;
  const joined = Boolean(v?.convertedMemberId);
  const openEdit = () => {
    if (!v) return;
    setEdit({ firstName: v.firstName, lastName: v.lastName, phone: v.phone ?? '', email: v.email ?? '', source: v.source ?? '', notes: v.notes ?? '' });
    setEditing(true);
  };
  const submitFollowUp = (event: FormEvent) => { event.preventDefault(); followUp.mutate(); };

  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        {!allowed ? (
          <NoAccess permission="visitor:view" />
        ) : visitor.isLoading ? (
          <LoadingBlock label="Loading visitor…" />
        ) : visitor.isError ? (
          <ErrorBlock error={visitor.error} onRetry={() => void visitor.refetch()} />
        ) : (
          v && (
            <>
              <Header
                back={<BackLink to="/visitors">Visitors</BackLink>}
                title={`${v.firstName} ${v.lastName}`}
                subtitle={`First visited ${formatDate(v.visitDate)}`}
                action={
                  <>
                    {canManage && !joined && <button type="button" className={secondaryBtn} onClick={openEdit}>Edit details</button>}
                    {canConvert && !joined && <button type="button" className={primaryBtn} onClick={() => setConverting(true)}>Convert to member</button>}
                  </>
                }
              />
              <div className="flex flex-wrap items-center gap-2">
                <Badge value={v.followUpStatus} />
                {joined && v.convertedMemberId && <Link to={`/members/${v.convertedMemberId}`} className="text-sm font-medium text-primary-700 hover:underline">View member record</Link>}
              </div>
              {converted && <SuccessNotice message={`Now a member. Membership number ${converted.membershipNumber}.`} />}
              <dl className="grid gap-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:grid-cols-2">
                <Row label="Email" value={v.email} />
                <Row label="Phone" value={v.phone} />
                <Row label="Heard about us" value={v.source} />
                <Row label="Notes" value={v.notes} />
              </dl>

              {canManage && !joined && (
                <form onSubmit={submitFollowUp} className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm" aria-label="Log a follow-up">
                  <h2 className="text-lg font-semibold text-gray-900">Log a follow-up</h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormSelect label="How" value={method} options={METHODS.map((m) => ({ value: m, label: titleCase(m) }))} onChange={(e) => setMethod(e.target.value as FollowUpMethod)} />
                    <FormSelect label="Outcome (optional)" value={outcome} placeholder="No change" options={[{ value: 'CONTACTED', label: 'Contacted' }, { value: 'SCHEDULED', label: 'Visit scheduled' }, { value: 'NOT_INTERESTED', label: 'Not interested' }]} onChange={(e) => setOutcome(e.target.value)} />
                  </div>
                  <FormTextarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} />
                  <FormError error={followUp.error} />
                  <button type="submit" className={primaryBtn} disabled={followUp.isPending}>{followUp.isPending ? 'Saving…' : 'Save follow-up'}</button>
                </form>
              )}

              <section className="space-y-3" aria-label="Follow-up history">
                <h2 className="text-lg font-semibold text-gray-900">History</h2>
                {v.followUps.length === 0 ? (
                  <p className="text-sm text-gray-500">No follow-ups logged yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {v.followUps.map((f) => (
                      <li key={f.id} className="rounded-lg border border-gray-200 bg-white p-4 text-sm">
                        <p className="font-medium text-gray-900">{titleCase(f.method)} · {formatDate(f.createdAt)}</p>
                        {f.notes && <p className="mt-1 whitespace-pre-wrap text-gray-700">{f.notes}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )
        )}
      </div>

      <Modal
        open={converting}
        title="Convert to member"
        onClose={() => setConverting(false)}
        footer={
          <>
            <button type="button" className={secondaryBtn} onClick={() => setConverting(false)}>Cancel</button>
            <button type="button" className={primaryBtn} disabled={convert.isPending} onClick={() => convert.mutate()}>{convert.isPending ? 'Converting…' : 'Create member'}</button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">This creates a member record from the visitor&apos;s details. The visit history stays attached.</p>
          <FormSelect label="Section (optional)" value={sectionId} placeholder="No section" options={(sections.data ?? []).map((s) => ({ value: s.id, label: s.name }))} onChange={(e) => setSectionId(e.target.value)} />
          <FormSelect label="Gender (optional)" value={gender} placeholder="Not recorded" options={[{ value: 'MALE', label: 'Male' }, { value: 'FEMALE', label: 'Female' }, { value: 'OTHER', label: 'Other' }]} onChange={(e) => setGender(e.target.value)} />
          <FormField label="Date of birth (optional)" type="date" value={dob} max={toDateInput(new Date().toISOString())} onChange={(e) => setDob(e.target.value)} />
          <FormError error={convert.error} />
        </div>
      </Modal>

      <Modal
        open={editing}
        title="Edit visitor"
        onClose={() => setEditing(false)}
        footer={
          <>
            <button type="button" className={secondaryBtn} onClick={() => setEditing(false)}>Cancel</button>
            <button type="button" className={primaryBtn} disabled={update.isPending || !edit.firstName.trim() || !edit.lastName.trim()} onClick={() => update.mutate()}>{update.isPending ? 'Saving…' : 'Save'}</button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="First name" value={edit.firstName} onChange={(e) => setEdit({ ...edit, firstName: e.target.value })} />
            <FormField label="Last name" value={edit.lastName} onChange={(e) => setEdit({ ...edit, lastName: e.target.value })} />
            <FormField label="Phone" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
            <FormField label="Email" type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
          </div>
          <FormField label="How did they hear about us?" value={edit.source} onChange={(e) => setEdit({ ...edit, source: e.target.value })} />
          <FormTextarea label="Notes" value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
          <FormError error={update.error} />
        </div>
      </Modal>
    </MainLayout>
  );
};
