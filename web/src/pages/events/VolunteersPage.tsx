import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormField } from '@/components/forms/FormField';
import { FormSelect } from '@/components/forms/FormSelect';
import { Modal } from '@/components/forms/Modal';
import { Pagination, card, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { apiClient } from '@/utils/api';
import { FINAL_VOLUNTEER_STATES } from '@/types/events';
import type { Volunteer, VolunteerStatus } from '@/types/events';
import { ApiError, DataState, E, PAGE_SIZE, Shell, Tag, dateTime, personName, td, th, useEventOptions, usePagedList, usePermissions } from './eventsShared';

const STATUSES: VolunteerStatus[] = ['ASSIGNED', 'CONFIRMED', 'DECLINED', 'COMPLETED', 'NO_SHOW', 'CANCELLED'];
const EMPTY = { eventId: '', memberId: '', role: '', notes: '' };

export const VolunteersPage = () => {
  const has = usePermissions();
  const queryClient = useQueryClient();
  const canView = has('volunteer:schedule:view');
  const canManage = has('volunteer:schedule:manage');
  const [status, setStatus] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const events = useEventOptions(canManage || canView);
  const all = usePagedList<Volunteer>('volunteers', '/volunteers', { status, eventId: eventFilter }, canView);
  const mine = usePagedList<Volunteer>('volunteers-mine', '/volunteers/mine');
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['events'] });

  const create = useMutation({
    mutationFn: () => apiClient.post(`${E}/volunteers`, { eventId: draft.eventId, memberId: draft.memberId.trim(), role: draft.role.trim(), ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}) }),
    onSuccess: () => { refresh(); setAdding(false); setDraft(EMPTY); },
  });
  const setState = useMutation({ mutationFn: ({ id, next }: { id: string; next: string }) => apiClient.put(`${E}/volunteers/${id}`, { status: next }), onSuccess: refresh });
  const respond = useMutation({ mutationFn: ({ id, response }: { id: string; response: 'CONFIRMED' | 'DECLINED' }) => apiClient.post(`${E}/volunteers/${id}/respond`, { response }), onSuccess: refresh });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!draft.eventId) next.eventId = 'Choose an event.';
    if (!draft.memberId.trim()) next.memberId = 'Enter the member ID.';
    if (draft.role.trim().length < 2) next.role = 'Enter a role.';
    setErrors(next);
    if (Object.keys(next).length === 0) create.mutate();
  };
  const eventOptions = (events.data ?? []).map((ev) => ({ value: ev.id, label: `${ev.title} · ${new Date(ev.startDateTime).toLocaleDateString()}` }));

  return (
    <Shell title="Volunteers" subtitle="Who is serving at which event." action={canManage && <button type="button" className={primaryBtn} onClick={() => setAdding(true)}>Assign volunteer</button>}>
      <section className={card}>
        <h2 className="mb-3 text-lg font-medium text-gray-900">My volunteering</h2>
        <ApiError error={respond.error} />
        <DataState query={mine.query} empty="You have no upcoming volunteer assignments.">
          <ul className="divide-y divide-gray-100">
            {mine.query.data?.items.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div><p className="font-medium text-gray-900">{v.role} · {v.event.title}</p><p className="text-sm text-gray-500">{dateTime(v.event.startDateTime)}</p></div>
                <div className="flex items-center gap-2">
                  <Tag value={v.status} />
                  {v.status === 'ASSIGNED' || v.status === 'DECLINED' ? <button type="button" className={primaryBtn} disabled={respond.isPending} onClick={() => respond.mutate({ id: v.id, response: 'CONFIRMED' })}>Confirm</button> : null}
                  {v.status === 'ASSIGNED' || v.status === 'CONFIRMED' ? <button type="button" className={secondaryBtn} disabled={respond.isPending} onClick={() => respond.mutate({ id: v.id, response: 'DECLINED' })}>Decline</button> : null}
                </div>
              </li>
            ))}
          </ul>
        </DataState>
      </section>

      {canView && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium text-gray-900">All assignments</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormSelect label="Status" value={status} placeholder="All" options={STATUSES.map((s) => ({ value: s, label: s.replace('_', ' ').toLowerCase() }))} onChange={(e) => setStatus(e.target.value)} />
            <FormSelect label="Event" value={eventFilter} placeholder="All events" options={eventOptions} onChange={(e) => setEventFilter(e.target.value)} />
          </div>
          <ApiError error={setState.error} />
          <DataState query={all.query} empty="No volunteer assignments.">
            <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
              <table className="min-w-full divide-y divide-gray-200">
                <thead><tr><th className={th}>Event</th><th className={th}>Volunteer</th><th className={th}>Role</th><th className={th}>Status</th><th className={th} /></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {all.query.data?.items.map((v) => (
                    <tr key={v.id}>
                      <td className={td}>{v.event.title}<div className="text-xs text-gray-500">{dateTime(v.event.startDateTime)}</div></td>
                      <td className={td}>{personName(v.member)}</td>
                      <td className={td}>{v.role}</td>
                      <td className={td}><Tag value={v.status} /></td>
                      <td className={`${td} text-right`}>
                        {canManage && !FINAL_VOLUNTEER_STATES.includes(v.status) && (
                          <span className="flex justify-end gap-2">
                            {(['COMPLETED', 'NO_SHOW', 'CANCELLED'] as const).map((next) => (
                              <button key={next} type="button" className={secondaryBtn} disabled={setState.isPending} onClick={() => setState.mutate({ id: v.id, next })}>{next === 'NO_SHOW' ? 'No-show' : next === 'COMPLETED' ? 'Completed' : 'Cancel'}</button>
                            ))}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={all.page} pageSize={PAGE_SIZE} total={all.query.data?.total ?? 0} onPage={all.setPage} />
          </DataState>
        </section>
      )}

      <Modal open={adding} title="Assign volunteer" onClose={() => setAdding(false)}>
        <form onSubmit={submit} className="space-y-3">
          <ApiError error={create.error} />
          {eventOptions.length > 0
            ? <FormSelect label="Event" value={draft.eventId} placeholder="Choose an event" options={eventOptions} onChange={(e) => setDraft({ ...draft, eventId: e.target.value })} error={errors.eventId} />
            : <FormField label="Event ID" value={draft.eventId} onChange={(e) => setDraft({ ...draft, eventId: e.target.value })} error={errors.eventId} />}
          <FormField label="Member ID" value={draft.memberId} onChange={(e) => setDraft({ ...draft, memberId: e.target.value })} error={errors.memberId} />
          <FormField label="Role" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} error={errors.role} />
          <FormField label="Notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          <div className="flex justify-end gap-2"><button type="button" className={secondaryBtn} onClick={() => setAdding(false)}>Cancel</button><button type="submit" className={primaryBtn} disabled={create.isPending}>Assign</button></div>
        </form>
      </Modal>
    </Shell>
  );
};
