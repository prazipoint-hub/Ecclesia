import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { FormSelect } from '@/components/forms/FormSelect';
import { FormTextarea } from '@/components/forms/FormTextarea';
import { Modal } from '@/components/forms/Modal';
import { EmptyBlock, ErrorBlock, LoadingBlock, Pagination, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { AdminHeader, NoAccess } from '@/pages/admin/adminShared';
import { Badge, BackLink, FormError, TableWrap, Td, Th } from '@/pages/members/peopleShared';
import { useAuthStore } from '@stores/authStore';
import { apiClient } from '@/utils/api';
import { can, toIso, type CommitteeSummary, type MeetingPage, type MeetingStatus } from '@/types/people';

const PAGE_SIZE = 20;
export const MEETINGS_KEY = ['committee-meetings'] as const;

const dateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export const CommitteeMeetingsPage = () => {
  const { committeeId = '' } = useParams();
  const navigate = useNavigate();
  const permissions = useAuthStore((s) => s.user?.permissions);
  const allowed = can(permissions, 'committee:view');
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<MeetingStatus | ''>('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ title: '', scheduledAt: '', location: '', agenda: '' });
  const [errors, setErrors] = useState<{ title?: string; scheduledAt?: string }>({});

  const committees = useQuery({
    queryKey: ['committees'],
    enabled: allowed,
    queryFn: async () => (await apiClient.get<CommitteeSummary[]>('/api/v2/committees')).data,
  });
  const committeeName = committees.data?.find((c) => c.id === committeeId)?.name;

  const list = useQuery({
    queryKey: [...MEETINGS_KEY, committeeId, status, page],
    enabled: allowed && Boolean(committeeId),
    queryFn: async () => (await apiClient.get<MeetingPage>(`/api/v2/committees/${committeeId}/meetings`, { params: { ...(status ? { status } : {}), page, pageSize: PAGE_SIZE } })).data,
  });

  const create = useMutation({
    mutationFn: async () =>
      (await apiClient.post<{ id: string }>(`/api/v2/committees/${committeeId}/meetings`, {
        title: draft.title.trim(),
        scheduledAt: toIso(draft.scheduledAt),
        ...(draft.location.trim() ? { location: draft.location.trim() } : {}),
        ...(draft.agenda.trim() ? { agenda: draft.agenda.trim() } : {}),
      })).data,
    onSuccess: async (meeting) => {
      await queryClient.invalidateQueries({ queryKey: MEETINGS_KEY });
      setCreating(false);
      navigate(`/committees/${committeeId}/meetings/${meeting.id}`);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: typeof errors = {};
    if (!draft.title.trim()) next.title = 'Enter a title.';
    if (!draft.scheduledAt) next.scheduledAt = 'Choose a date and time.';
    setErrors(next);
    if (Object.keys(next).length === 0) create.mutate();
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-5xl space-y-6">
        <AdminHeader
          title={committeeName ? `${committeeName} meetings` : 'Committee meetings'}
          subtitle="Agendas, minutes and decisions."
          action={can(permissions, 'committee:meeting:create') && <button type="button" className={primaryBtn} onClick={() => { setDraft({ title: '', scheduledAt: '', location: '', agenda: '' }); setErrors({}); setCreating(true); }}>New meeting</button>}
        />
        <BackLink to="/district/committees">Committees</BackLink>
        {!allowed ? (
          <NoAccess permission="committee:view" />
        ) : (
          <>
            <div className="max-w-xs">
              <FormSelect label="Status" value={status} placeholder="All meetings" options={[{ value: 'SCHEDULED', label: 'Scheduled' }, { value: 'HELD', label: 'Held' }, { value: 'CANCELLED', label: 'Cancelled' }]} onChange={(e) => { setStatus(e.target.value as MeetingStatus | ''); setPage(1); }} />
            </div>
            {list.isLoading ? (
              <LoadingBlock label="Loading meetings…" />
            ) : list.isError ? (
              <ErrorBlock error={list.error} onRetry={() => void list.refetch()} />
            ) : list.data && list.data.items.length === 0 ? (
              <EmptyBlock message="No meetings yet." />
            ) : (
              list.data && (
                <>
                  <TableWrap label="Meetings">
                    <thead className="bg-gray-50"><tr><Th>Meeting</Th><Th>When</Th><Th>Where</Th><Th>Status</Th><Th>Decisions</Th></tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {list.data.items.map((m) => (
                        <tr key={m.id}>
                          <Td><Link to={`/committees/${committeeId}/meetings/${m.id}`} className="font-medium text-primary-700 hover:underline">{m.title}</Link></Td>
                          <Td className="whitespace-nowrap">{dateTime(m.scheduledAt)}</Td>
                          <Td>{m.location ?? '—'}</Td>
                          <Td>
                            <span className="inline-flex items-center gap-2"><Badge value={m.status} />{m.minutesLocked && <Lock className="h-4 w-4 text-gray-500" aria-label="Minutes locked" />}</span>
                          </Td>
                          <Td>{m.decisionCount}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </TableWrap>
                  <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPage={setPage} />
                </>
              )
            )}
          </>
        )}
      </div>
      <Modal open={creating} title="New meeting" onClose={() => setCreating(false)}>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormField label="Title" value={draft.title} error={errors.title} maxLength={150} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <FormField label="Date and time" type="datetime-local" value={draft.scheduledAt} error={errors.scheduledAt} onChange={(e) => setDraft({ ...draft, scheduledAt: e.target.value })} />
          <FormField label="Location" value={draft.location} maxLength={200} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
          <FormTextarea label="Agenda" value={draft.agenda} onChange={(e) => setDraft({ ...draft, agenda: e.target.value })} />
          <FormError error={create.error} />
          <div className="flex justify-end gap-2">
            <button type="button" className={secondaryBtn} onClick={() => setCreating(false)}>Cancel</button>
            <button type="submit" className={primaryBtn} disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create meeting'}</button>
          </div>
        </form>
      </Modal>
    </MainLayout>
  );
};
