import { useState } from 'react';
import type { FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormField } from '@/components/forms/FormField';
import { FormSelect } from '@/components/forms/FormSelect';
import { Pagination, card, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { apiClient } from '@/utils/api';
import type { Registration } from '@/types/events';
import { ApiError, DataState, E, PAGE_SIZE, Shell, Tag, dateTime, td, th, usePagedList, usePermissions } from './eventsShared';

export const RegistrationsPage = () => {
  const { eventId = '' } = useParams();
  const has = usePermissions();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const [memberId, setMemberId] = useState('');
  const [guest, setGuest] = useState({ name: '', email: '', phone: '' });
  const [formError, setFormError] = useState('');
  const list = usePagedList<Registration>('registrations', `/${eventId}/registrations`, { status }, has('event:registration:manage'));
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['events', 'registrations'] });

  const add = useMutation({
    mutationFn: (body: object) => apiClient.post(`${E}/${eventId}/registrations`, body),
    onSuccess: () => { refresh(); setMemberId(''); setGuest({ name: '', email: '', phone: '' }); },
  });
  const cancel = useMutation({ mutationFn: (id: string) => apiClient.delete(`${E}/${eventId}/registrations/${id}`), onSuccess: refresh });

  const submitMember = (e: FormEvent) => {
    e.preventDefault();
    if (!memberId.trim()) { setFormError('Enter a member ID.'); return; }
    setFormError('');
    add.mutate({ memberId: memberId.trim() });
  };
  const submitGuest = (e: FormEvent) => {
    e.preventDefault();
    if (guest.name.trim().length < 2) { setFormError('Enter the guest name.'); return; }
    setFormError('');
    add.mutate({ guest: { name: guest.name.trim(), ...(guest.email.trim() ? { email: guest.email.trim() } : {}), ...(guest.phone.trim() ? { phone: guest.phone.trim() } : {}) } });
  };

  return (
    <Shell title="Registrations" permission="event:registration:manage">
      <div className="grid gap-4 md:grid-cols-2">
        <form onSubmit={submitMember} className={`${card} space-y-3`}>
          <h2 className="font-semibold text-gray-900">Register a member</h2>
          <FormField label="Member ID" value={memberId} onChange={(e) => setMemberId(e.target.value)} />
          <button type="submit" className={primaryBtn} disabled={add.isPending}>Register</button>
        </form>
        <form onSubmit={submitGuest} className={`${card} space-y-3`}>
          <h2 className="font-semibold text-gray-900">Add a guest</h2>
          <FormField label="Name" value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} />
          <FormField label="Email" type="email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} />
          <FormField label="Phone" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} />
          <button type="submit" className={primaryBtn} disabled={add.isPending}>Add guest</button>
        </form>
      </div>
      {formError && <ApiError error={new Error(formError)} />}
      <ApiError error={add.error ?? cancel.error} />
      <FormSelect label="Show" value={status} placeholder="All" options={[{ value: 'REGISTERED', label: 'Registered' }, { value: 'CANCELLED', label: 'Cancelled' }]} onChange={(e) => setStatus(e.target.value)} className="max-w-xs" />
      <DataState query={list.query} empty="No registrations.">
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead><tr><th className={th}>Name</th><th className={th}>Contact</th><th className={th}>Registered</th><th className={th}>Status</th><th className={th} /></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {list.query.data?.items.map((r) => (
                <tr key={r.id}>
                  <td className={td}>{r.name}{!r.memberId && <span className="ml-2 text-xs text-gray-500">Guest</span>}</td>
                  <td className={td}>{[r.email, r.phone].filter(Boolean).join(' · ') || '—'}</td>
                  <td className={td}>{dateTime(r.createdAt)}</td>
                  <td className={td}><Tag value={r.status} /></td>
                  <td className={`${td} text-right`}>
                    {r.status === 'REGISTERED' && <button type="button" className={secondaryBtn} disabled={cancel.isPending} onClick={() => cancel.mutate(r.id)}>Cancel</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={list.page} pageSize={PAGE_SIZE} total={list.query.data?.total ?? 0} onPage={list.setPage} />
      </DataState>
    </Shell>
  );
};
