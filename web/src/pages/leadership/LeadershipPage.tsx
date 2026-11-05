import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { FormSelect } from '@/components/forms/FormSelect';
import { FormTextarea } from '@/components/forms/FormTextarea';
import { Modal } from '@/components/forms/Modal';
import { SearchInput } from '@/components/forms/SearchInput';
import { EmptyBlock, ErrorBlock, LoadingBlock, Pagination, formatDate, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { AdminHeader, NoAccess } from '@/pages/admin/adminShared';
import { Badge, FormError, TableWrap, Td, Th } from '@/pages/members/peopleShared';
import { useAuthStore } from '@stores/authStore';
import { apiClient } from '@/utils/api';
import { can, fullName, toIso, type Appointment, type AppointmentPage, type DirectoryPage, type TermItem, type TermPage, type TermStatus } from '@/types/people';

const PAGE_SIZE = 25;
const KEY = ['leadership'] as const;
type Tab = 'appointments' | 'terms';

/** Search-as-you-type member picker for choosing a successor. */
const MemberPicker = ({ excludeId, selected, onSelect }: { excludeId?: string; selected: { id: string; name: string } | null; onSelect: (m: { id: string; name: string } | null) => void }) => {
  const [q, setQ] = useState('');
  const onSearch = useCallback((value: string) => setQ(value), []);
  const results = useQuery({
    queryKey: ['members', 'picker', q],
    enabled: q.length >= 2,
    queryFn: async () => (await apiClient.get<DirectoryPage>('/api/v2/members/search', { params: { q, pageSize: 8 } })).data.items,
  });
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">Successor (optional)</p>
      {selected ? (
        <p className="flex items-center justify-between rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <span>{selected.name}</span>
          <button type="button" className="font-semibold text-primary-700 underline" onClick={() => onSelect(null)}>Remove</button>
        </p>
      ) : (
        <>
          <SearchInput onSearch={onSearch} placeholder="Search members for a successor" />
          {results.data && results.data.length > 0 && (
            <ul className="max-h-48 overflow-y-auto rounded-lg border border-gray-200" aria-label="Successor results">
              {results.data.filter((m) => m.id !== excludeId).map((m) => (
                <li key={m.id}>
                  <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => onSelect({ id: m.id, name: fullName(m) })}>
                    {fullName(m)} <span className="text-gray-500">· {m.membershipNumber}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {results.data && results.data.length === 0 && q.length >= 2 && <p className="text-xs text-gray-500">No members found.</p>}
        </>
      )}
    </div>
  );
};

type EndTarget = { termId: string; name: string; memberId: string };

const EndTermModal = ({ target, onClose }: { target: EndTarget | null; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'COMPLETED' | 'TERMINATED'>('COMPLETED');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [successor, setSuccessor] = useState<{ id: string; name: string } | null>(null);
  const end = useMutation({
    mutationFn: async () =>
      (await apiClient.put(`/api/v2/leadership/terms/${target!.termId}/end`, {
        status, ...(endDate ? { endDate: toIso(endDate) } : {}), ...(successor ? { successorId: successor.id } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}),
      })).data,
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: KEY }); onClose(); },
  });
  return (
    <Modal
      open={target !== null}
      title={target ? `End term: ${target.name}` : 'End term'}
      onClose={onClose}
      footer={<><button type="button" className={secondaryBtn} onClick={onClose}>Cancel</button><button type="button" className={primaryBtn} disabled={end.isPending} onClick={() => end.mutate()}>{end.isPending ? 'Ending…' : 'End term'}</button></>}
    >
      <div className="space-y-4">
        <p role="note" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Ending a term also ends this person&apos;s authority and the permissions that come with the appointment, from the end date.
        </p>
        <FormSelect label="How did it end?" value={status} options={[{ value: 'COMPLETED', label: 'Completed normally' }, { value: 'TERMINATED', label: 'Terminated early' }]} onChange={(e) => setStatus(e.target.value as 'COMPLETED' | 'TERMINATED')} />
        <FormField label="End date (defaults to today)" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        <MemberPicker excludeId={target?.memberId} selected={successor} onSelect={setSuccessor} />
        <FormTextarea label="Notes" rows={3} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
        <FormError error={end.error} />
      </div>
    </Modal>
  );
};

const StartTermModal = ({ target, onClose }: { target: Appointment | null; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const [startDate, setStartDate] = useState('');
  const [plannedEnd, setPlannedEnd] = useState('');
  const [notes, setNotes] = useState('');
  const start = useMutation({
    mutationFn: async () =>
      (await apiClient.post(`/api/v2/leadership/assignments/${target!.id}/terms`, {
        ...(startDate ? { startDate: toIso(startDate) } : {}), ...(plannedEnd ? { plannedEndDate: toIso(plannedEnd) } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}),
      })).data,
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: KEY }); onClose(); },
  });
  const invalid = Boolean(plannedEnd && new Date(plannedEnd) <= new Date(startDate || Date.now()));
  return (
    <Modal
      open={target !== null}
      title={target ? `Start a term: ${fullName(target.member)}` : 'Start a term'}
      onClose={onClose}
      footer={<><button type="button" className={secondaryBtn} onClick={onClose}>Cancel</button><button type="button" className={primaryBtn} disabled={start.isPending || invalid} onClick={() => start.mutate()}>{start.isPending ? 'Starting…' : 'Start term'}</button></>}
    >
      <div className="space-y-4">
        <FormField label="Start date (defaults to today)" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <FormField label="Planned end date" type="date" value={plannedEnd} error={invalid ? 'Must be after the start date.' : undefined} hint="Authority lapses automatically on this date." onChange={(e) => setPlannedEnd(e.target.value)} />
        <FormTextarea label="Notes" rows={3} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
        <FormError error={start.error} />
      </div>
    </Modal>
  );
};

export const LeadershipPage = () => {
  const permissions = useAuthStore((s) => s.user?.permissions);
  const allowed = can(permissions, 'leadership:term:manage');
  const [tab, setTab] = useState<Tab>('appointments');
  const [page, setPage] = useState(1);
  const [activeOnly, setActiveOnly] = useState(true);
  const [termStatus, setTermStatus] = useState<TermStatus | ''>('');
  const [expiring, setExpiring] = useState('');
  const [starting, setStarting] = useState<Appointment | null>(null);
  const [ending, setEnding] = useState<EndTarget | null>(null);

  const appointments = useQuery({
    queryKey: [...KEY, 'assignments', activeOnly, page],
    enabled: allowed && tab === 'appointments',
    queryFn: async () => (await apiClient.get<AppointmentPage>('/api/v2/leadership/assignments', { params: { activeOnly: String(activeOnly), page, pageSize: PAGE_SIZE } })).data,
  });
  const terms = useQuery({
    queryKey: [...KEY, 'terms', termStatus, expiring, page],
    enabled: allowed && tab === 'terms',
    queryFn: async () => (await apiClient.get<TermPage>('/api/v2/leadership/terms', { params: { ...(termStatus ? { status: termStatus } : {}), ...(expiring ? { expiringWithinDays: expiring } : {}), page, pageSize: PAGE_SIZE } })).data,
  });

  const switchTab = (next: Tab) => { setTab(next); setPage(1); };
  const endTarget = (t: TermItem): EndTarget => ({ termId: t.id, name: `${fullName(t.member)} (${t.roleName})`, memberId: t.member.id });

  return (
    <MainLayout>
      <div className="mx-auto max-w-6xl space-y-7">
        <AdminHeader title="Leadership" subtitle="Appointments and their terms of service." />
        {!allowed ? (
          <NoAccess permission="leadership:term:manage" />
        ) : (
          <>
            <div role="tablist" aria-label="Leadership views" className="inline-flex gap-1 rounded-xl border border-gray-200/80 bg-white p-1.5 shadow-sm">
              {(['appointments', 'terms'] as Tab[]).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => switchTab(t)} className={`min-h-10 rounded-lg px-4 py-2 text-sm font-semibold ${tab === t ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>
                  {t === 'appointments' ? 'Appointments' : 'Terms'}
                </button>
              ))}
            </div>

            {tab === 'appointments' ? (
              <>
                <label className="inline-flex min-h-11 items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 shadow-sm">
                  <input type="checkbox" checked={activeOnly} onChange={(e) => { setActiveOnly(e.target.checked); setPage(1); }} /> Current appointments only
                </label>
                {appointments.isLoading ? <LoadingBlock label="Loading appointments…" /> : appointments.isError ? <ErrorBlock error={appointments.error} onRetry={() => void appointments.refetch()} /> : appointments.data && appointments.data.items.length === 0 ? <EmptyBlock message="No appointments found." /> : appointments.data && (
                  <>
                    <TableWrap label="Appointments">
                      <thead className="bg-gray-50"><tr><Th>Leader</Th><Th>Role</Th><Th>Committee</Th><Th>Current term</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {appointments.data.items.map((a) => (
                          <tr key={a.id}>
                            <Td><span className="font-medium text-gray-900">{fullName(a.member)}</span></Td>
                            <Td>{a.role.name}{a.position ? ` · ${a.position}` : ''}</Td>
                            <Td>{a.committee?.name ?? '—'}</Td>
                            <Td>{a.currentTerm ? `Term ${a.currentTerm.termNumber}${a.currentTerm.plannedEndDate ? `, ends ${formatDate(a.currentTerm.plannedEndDate)}` : ''}` : <span className="text-gray-500">No active term ({a.termCount} past)</span>}</Td>
                            <Td>
                              {a.currentTerm ? (
                                <button type="button" className={secondaryBtn} onClick={() => setEnding({ termId: a.currentTerm!.id, name: `${fullName(a.member)} (${a.role.name})`, memberId: a.member.id })}>End term</button>
                              ) : (
                                <button type="button" className={primaryBtn} onClick={() => setStarting(a)}>Start term</button>
                              )}
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </TableWrap>
                    <Pagination page={page} pageSize={PAGE_SIZE} total={appointments.data.total} onPage={setPage} />
                  </>
                )}
              </>
            ) : (
              <>
                <div className="grid max-w-xl gap-3 sm:grid-cols-2">
                  <FormSelect label="Status" value={termStatus} placeholder="All terms" options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'COMPLETED', label: 'Completed' }, { value: 'TERMINATED', label: 'Terminated' }]} onChange={(e) => { setTermStatus(e.target.value as TermStatus | ''); setPage(1); }} />
                  <FormSelect label="Ending within" value={expiring} placeholder="Any time" options={[{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '180', label: '6 months' }, { value: '365', label: '1 year' }]} onChange={(e) => { setExpiring(e.target.value); setPage(1); }} />
                </div>
                {terms.isLoading ? <LoadingBlock label="Loading terms…" /> : terms.isError ? <ErrorBlock error={terms.error} onRetry={() => void terms.refetch()} /> : terms.data && terms.data.items.length === 0 ? <EmptyBlock message="No terms found." /> : terms.data && (
                  <>
                    <TableWrap label="Terms">
                      <thead className="bg-gray-50"><tr><Th>Leader</Th><Th>Role</Th><Th>Term</Th><Th>Period</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {terms.data.items.map((t) => (
                          <tr key={t.id}>
                            <Td><span className="font-medium text-gray-900">{fullName(t.member)}</span></Td>
                            <Td>{t.roleName}{t.committeeName ? ` · ${t.committeeName}` : ''}</Td>
                            <Td>#{t.termNumber}</Td>
                            <Td className="whitespace-nowrap">{formatDate(t.startDate)} – {formatDate(t.endDate ?? t.plannedEndDate)}{t.daysRemaining !== null && <span className={`ml-2 text-xs ${t.daysRemaining <= 30 ? 'text-red-600' : 'text-gray-500'}`}>{t.daysRemaining} days left</span>}</Td>
                            <Td><Badge value={t.status} /></Td>
                            <Td>{t.status === 'ACTIVE' && <button type="button" className={secondaryBtn} onClick={() => setEnding(endTarget(t))}>End term</button>}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </TableWrap>
                    <Pagination page={page} pageSize={PAGE_SIZE} total={terms.data.total} onPage={setPage} />
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
      <StartTermModal key={`start-${starting?.id ?? 'none'}`} target={starting} onClose={() => setStarting(null)} />
      <EndTermModal key={`end-${ending?.termId ?? 'none'}`} target={ending} onClose={() => setEnding(null)} />
    </MainLayout>
  );
};
