import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { FormSelect } from '@/components/forms/FormSelect';
import { FormTextarea } from '@/components/forms/FormTextarea';
import { Modal } from '@/components/forms/Modal';
import { ErrorBlock, LoadingBlock, formatDate, primaryBtn, secondaryBtn, titleCase } from '@/pages/account/shared';
import { NoAccess } from '@/pages/admin/adminShared';
import { SuccessNotice } from '@/pages/auth/AuthShell';
import { BackLink, Badge, FormError, Header } from '@/pages/members/peopleShared';
import { useAuthStore } from '@stores/authStore';
import { apiClient } from '@/utils/api';
import { DECISION_STATUSES, can, toDateInput, toIso, toLocalInput, type Decision, type DecisionStatus, type MeetingDetail } from '@/types/people';
import { MEETINGS_KEY } from './CommitteeMeetingsPage';

type DecisionDraft = { description: string; status: DecisionStatus; votesFor: string; votesAgainst: string; abstentions: string; dueDate: string };
const EMPTY_DECISION: DecisionDraft = { description: '', status: 'PROPOSED', votesFor: '0', votesAgainst: '0', abstentions: '0', dueDate: '' };

const toDraft = (d: Decision): DecisionDraft => ({
  description: d.description, status: d.status, votesFor: String(d.votesFor), votesAgainst: String(d.votesAgainst), abstentions: String(d.abstentions), dueDate: toDateInput(d.dueDate),
});

const DecisionModal = ({ meetingId, editing, open, onClose }: { meetingId: string; editing: Decision | null; open: boolean; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<DecisionDraft>(EMPTY_DECISION);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) { setDraft(editing ? toDraft(editing) : EMPTY_DECISION); setError(null); }
  }, [open, editing]);

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        description: draft.description.trim(), status: draft.status,
        votesFor: Number(draft.votesFor), votesAgainst: Number(draft.votesAgainst), abstentions: Number(draft.abstentions),
        dueDate: draft.dueDate ? new Date(draft.dueDate).toISOString() : editing ? null : undefined,
      };
      return editing ? (await apiClient.put(`/api/v2/committees/decisions/${editing.id}`, body)).data : (await apiClient.post(`/api/v2/committees/meetings/${meetingId}/decisions`, body)).data;
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: MEETINGS_KEY }); onClose(); },
  });

  const submit = () => {
    const votes = [draft.votesFor, draft.votesAgainst, draft.abstentions].map(Number);
    if (!draft.description.trim()) return setError('Describe the decision.');
    if (votes.some((v) => !Number.isInteger(v) || v < 0)) return setError('Votes must be whole numbers, zero or more.');
    setError(null);
    save.mutate();
  };
  const num = (key: 'votesFor' | 'votesAgainst' | 'abstentions') => ({ type: 'number' as const, min: 0, value: draft[key], onChange: (e: { target: { value: string } }) => setDraft({ ...draft, [key]: e.target.value }) });

  return (
    <Modal
      open={open}
      title={editing ? 'Edit decision' : 'Record a decision'}
      onClose={onClose}
      footer={<><button type="button" className={secondaryBtn} onClick={onClose}>Cancel</button><button type="button" className={primaryBtn} disabled={save.isPending} onClick={submit}>{save.isPending ? 'Saving…' : 'Save decision'}</button></>}
    >
      <div className="space-y-4">
        <FormTextarea label="Decision" value={draft.description} maxLength={5000} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        <FormSelect label="Outcome" value={draft.status} options={DECISION_STATUSES.map((s) => ({ value: s, label: titleCase(s) }))} onChange={(e) => setDraft({ ...draft, status: e.target.value as DecisionStatus })} />
        <div className="grid grid-cols-3 gap-3">
          <FormField label="For" {...num('votesFor')} />
          <FormField label="Against" {...num('votesAgainst')} />
          <FormField label="Abstain" {...num('abstentions')} />
        </div>
        <FormField label="Action due (optional)" type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <FormError error={save.error} />
      </div>
    </Modal>
  );
};

export const MeetingDetailPage = () => {
  const { committeeId = '', meetingId = '' } = useParams();
  const permissions = useAuthStore((s) => s.user?.permissions);
  const allowed = can(permissions, 'committee:view');
  const canManage = can(permissions, 'committee:meeting:manage');
  const queryClient = useQueryClient();
  const key = [...MEETINGS_KEY, 'detail', meetingId];

  const meeting = useQuery({ queryKey: key, enabled: allowed && Boolean(meetingId), queryFn: async () => (await apiClient.get<MeetingDetail>(`/api/v2/committees/meetings/${meetingId}`)).data });
  const m = meeting.data;
  const locked = Boolean(m?.minutesLocked);
  const editable = canManage && Boolean(m) && !locked && m?.status !== 'CANCELLED';

  const [form, setForm] = useState({ title: '', scheduledAt: '', location: '', agenda: '', minutes: '' });
  useEffect(() => {
    if (m) setForm({ title: m.title, scheduledAt: toLocalInput(m.scheduledAt), location: m.location ?? '', agenda: m.agenda ?? '', minutes: m.minutes ?? '' });
  }, [m]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: MEETINGS_KEY });
  const save = useMutation({
    mutationFn: async () =>
      (await apiClient.put(`/api/v2/committees/meetings/${meetingId}`, {
        title: form.title.trim(), scheduledAt: toIso(form.scheduledAt), location: form.location.trim() || null, agenda: form.agenda.trim() || null,
        ...(m?.status === 'HELD' ? { minutes: form.minutes.trim() || null } : {}),
      })).data,
    onSuccess: refresh,
  });
  const transition = useMutation({
    mutationFn: async (action: 'held' | 'cancel' | 'lock-minutes') => (await apiClient.post(`/api/v2/committees/meetings/${meetingId}/${action}`)).data,
    onSuccess: async () => { setConfirm(null); await refresh(); },
  });
  const removeDecision = useMutation({
    mutationFn: async (id: string) => { await apiClient.delete(`/api/v2/committees/decisions/${id}`); },
    onSuccess: async () => { setDeleting(null); await refresh(); },
  });

  const [confirm, setConfirm] = useState<'cancel' | 'lock-minutes' | null>(null);
  const [decisionModal, setDecisionModal] = useState<{ open: boolean; editing: Decision | null }>({ open: false, editing: null });
  const [deleting, setDeleting] = useState<Decision | null>(null);
  const minutesSaved = Boolean(m?.minutes?.trim());
  const minutesDirty = (form.minutes.trim() || '') !== (m?.minutes?.trim() || '');

  return (
    <MainLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        {!allowed ? (
          <NoAccess permission="committee:view" />
        ) : meeting.isLoading ? (
          <LoadingBlock label="Loading meeting…" />
        ) : meeting.isError ? (
          <ErrorBlock error={meeting.error} onRetry={() => void meeting.refetch()} />
        ) : (
          m && (
            <>
              <Header
                back={<BackLink to={`/committees/${committeeId}/meetings`}>{m.committeeName} meetings</BackLink>}
                title={m.title}
                subtitle={new Date(m.scheduledAt).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })}
                action={
                  canManage && !locked && (
                    <>
                      {m.status === 'SCHEDULED' && <button type="button" className={primaryBtn} disabled={transition.isPending} onClick={() => transition.mutate('held')}>Mark as held</button>}
                      {m.status === 'SCHEDULED' && <button type="button" className={secondaryBtn} onClick={() => setConfirm('cancel')}>Cancel meeting</button>}
                      {m.status === 'HELD' && <button type="button" className={primaryBtn} disabled={!minutesSaved || minutesDirty} title={!minutesSaved ? 'Save the minutes first' : undefined} onClick={() => setConfirm('lock-minutes')}>Lock minutes</button>}
                    </>
                  )
                }
              />
              <div className="flex flex-wrap items-center gap-2">
                <Badge value={m.status} />
                {locked && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-800 px-2.5 py-0.5 text-xs font-medium text-white"><Lock className="h-3 w-3" /> Minutes locked {formatDate(m.minutesLockedAt)}</span>
                )}
              </div>
              {locked && <SuccessNotice message="These minutes are the permanent record and can no longer be edited." />}
              <FormError error={transition.error} />

              <section className="space-y-4 rounded-md border border-gray-200 bg-white p-6 shadow-sm" aria-label="Meeting details">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Title" value={form.title} disabled={!editable} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                  <FormField label="Date and time" type="datetime-local" value={form.scheduledAt} disabled={!editable} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
                </div>
                <FormField label="Location" value={form.location} disabled={!editable} onChange={(e) => setForm({ ...form, location: e.target.value })} />
                <FormTextarea label="Agenda" value={form.agenda} disabled={!editable} onChange={(e) => setForm({ ...form, agenda: e.target.value })} />
                {m.status === 'SCHEDULED' ? (
                  <p className="text-sm text-gray-500">Minutes can be recorded once the meeting has been held.</p>
                ) : (
                  <FormTextarea label="Minutes" rows={10} value={form.minutes} disabled={!editable || m.status !== 'HELD'} onChange={(e) => setForm({ ...form, minutes: e.target.value })} />
                )}
                {editable && (
                  <>
                    <FormError error={save.error} />
                    <button type="button" className={primaryBtn} disabled={save.isPending || !form.title.trim() || !form.scheduledAt} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save changes'}</button>
                  </>
                )}
              </section>

              <section className="space-y-3" aria-label="Decisions">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium text-gray-900">Decisions</h2>
                  {editable && <button type="button" className={secondaryBtn} onClick={() => setDecisionModal({ open: true, editing: null })}>Record a decision</button>}
                </div>
                {m.decisions.length === 0 ? (
                  <p className="text-sm text-gray-500">No decisions recorded.</p>
                ) : (
                  <ul className="space-y-3">
                    {m.decisions.map((d) => (
                      <li key={d.id} className="rounded-lg border border-gray-200 bg-white p-4 text-sm">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="whitespace-pre-wrap text-gray-900">{d.description}</p>
                          <Badge value={d.status} />
                        </div>
                        <p className="mt-2 text-gray-600">For {d.votesFor} · Against {d.votesAgainst} · Abstain {d.abstentions}{d.dueDate ? ` · Due ${formatDate(d.dueDate)}` : ''}</p>
                        {editable && (
                          <div className="mt-3 flex gap-2">
                            <button type="button" className={secondaryBtn} onClick={() => setDecisionModal({ open: true, editing: d })}>Edit</button>
                            <button type="button" className={secondaryBtn} onClick={() => setDeleting(d)}>Delete</button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )
        )}
      </div>

      <DecisionModal meetingId={meetingId} editing={decisionModal.editing} open={decisionModal.open} onClose={() => setDecisionModal({ open: false, editing: null })} />

      <Modal
        open={confirm !== null}
        title={confirm === 'lock-minutes' ? 'Lock the minutes?' : 'Cancel this meeting?'}
        onClose={() => setConfirm(null)}
        footer={
          <>
            <button type="button" className={secondaryBtn} onClick={() => setConfirm(null)}>Go back</button>
            <button type="button" className={primaryBtn} disabled={transition.isPending} onClick={() => confirm && transition.mutate(confirm)}>
              {transition.isPending ? 'Working…' : confirm === 'lock-minutes' ? 'Lock permanently' : 'Cancel meeting'}
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-700">
          {confirm === 'lock-minutes'
            ? 'Locking makes the minutes and decisions the permanent record. This cannot be undone and nobody will be able to edit them afterwards.'
            : 'The meeting will be marked as cancelled and can no longer be edited.'}
        </p>
        <div className="mt-3"><FormError error={transition.error} /></div>
      </Modal>

      <Modal
        open={deleting !== null}
        title="Delete this decision?"
        onClose={() => setDeleting(null)}
        footer={<><button type="button" className={secondaryBtn} onClick={() => setDeleting(null)}>Cancel</button><button type="button" className={primaryBtn} disabled={removeDecision.isPending} onClick={() => deleting && removeDecision.mutate(deleting.id)}>Delete</button></>}
      >
        <p className="text-sm text-gray-700">This removes the decision from the meeting record.</p>
        <div className="mt-3"><FormError error={removeDecision.error} /></div>
      </Modal>
    </MainLayout>
  );
};
