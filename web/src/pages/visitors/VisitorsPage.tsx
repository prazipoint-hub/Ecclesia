import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { FormTextarea } from '@/components/forms/FormTextarea';
import { Modal } from '@/components/forms/Modal';
import { SearchInput } from '@/components/forms/SearchInput';
import { EmptyBlock, ErrorBlock, LoadingBlock, Pagination, formatDate, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { AdminHeader, NoAccess } from '@/pages/admin/adminShared';
import { Badge, FormError, TableWrap, Td, Th } from '@/pages/members/peopleShared';
import { useAuthStore } from '@stores/authStore';
import { apiClient } from '@/utils/api';
import { VISITOR_STATUSES, can, type Visitor, type VisitorPage, type VisitorStatus } from '@/types/people';

const PAGE_SIZE = 25;
export const VISITORS_KEY = ['visitors'] as const;

type Draft = { firstName: string; lastName: string; phone: string; email: string; source: string; notes: string };
const EMPTY: Draft = { firstName: '', lastName: '', phone: '', email: '', source: '', notes: '' };

const NewVisitorModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const create = useMutation({
    mutationFn: async () => (await apiClient.post<Visitor>('/api/v2/visitors', draft)).data,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: VISITORS_KEY });
      setDraft(EMPTY);
      onClose();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: typeof errors = {};
    if (!draft.firstName.trim()) next.firstName = 'Enter a first name.';
    if (!draft.lastName.trim()) next.lastName = 'Enter a last name.';
    if (draft.email.trim() && !/^\S+@\S+\.\S+$/.test(draft.email.trim())) next.email = 'Enter a valid email address.';
    setErrors(next);
    if (Object.keys(next).length === 0) create.mutate();
  };
  const set = (key: keyof Draft) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [key]: e.target.value }));

  return (
    <Modal open={open} title="New visitor" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="First name" value={draft.firstName} error={errors.firstName} onChange={set('firstName')} maxLength={100} />
          <FormField label="Last name" value={draft.lastName} error={errors.lastName} onChange={set('lastName')} maxLength={100} />
          <FormField label="Phone" value={draft.phone} onChange={set('phone')} maxLength={30} />
          <FormField label="Email" type="email" value={draft.email} error={errors.email} onChange={set('email')} />
        </div>
        <FormField label="How did they hear about us?" value={draft.source} onChange={set('source')} maxLength={100} />
        <FormTextarea label="Notes" value={draft.notes} onChange={set('notes')} maxLength={5000} />
        <FormError error={create.error} />
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryBtn} onClick={onClose}>Cancel</button>
          <button type="submit" className={primaryBtn} disabled={create.isPending}>{create.isPending ? 'Saving…' : 'Add visitor'}</button>
        </div>
      </form>
    </Modal>
  );
};

export const VisitorsPage = () => {
  const permissions = useAuthStore((s) => s.user?.permissions);
  const allowed = can(permissions, 'visitor:view');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<VisitorStatus | ''>('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const onSearch = useCallback((value: string) => { setQ(value); setPage(1); }, []);

  const list = useQuery({
    queryKey: [...VISITORS_KEY, 'list', q, status, page],
    enabled: allowed,
    queryFn: async () =>
      (await apiClient.get<VisitorPage>('/api/v2/visitors', { params: { ...(q ? { q } : {}), ...(status ? { status } : {}), page, pageSize: PAGE_SIZE } })).data,
  });

  return (
    <MainLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <AdminHeader
          title="Visitors"
          subtitle="Follow up with first-time guests and welcome them into the church family."
          action={can(permissions, 'visitor:create') && <button type="button" className={primaryBtn} onClick={() => setCreating(true)}>New visitor</button>}
        />
        {!allowed ? (
          <NoAccess permission="visitor:view" />
        ) : (
          <>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
              <button type="button" aria-pressed={status === ''} className={`rounded-full border px-3 py-1 text-sm ${status === '' ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-gray-300 text-gray-600'}`} onClick={() => { setStatus(''); setPage(1); }}>
                All
              </button>
              {VISITOR_STATUSES.map((s) => (
                <button key={s} type="button" aria-pressed={status === s} className={`rounded-full border px-3 py-1 text-sm ${status === s ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-gray-300 text-gray-600'}`} onClick={() => { setStatus(s); setPage(1); }}>
                  {s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ')} ({list.data?.statusCounts[s] ?? 0})
                </button>
              ))}
            </div>
            <SearchInput onSearch={onSearch} placeholder="Search visitors" className="max-w-md" />
            {list.isLoading ? (
              <LoadingBlock label="Loading visitors…" />
            ) : list.isError ? (
              <ErrorBlock error={list.error} onRetry={() => void list.refetch()} />
            ) : list.data && list.data.items.length === 0 ? (
              <EmptyBlock message="No visitors found." />
            ) : (
              list.data && (
                <>
                  <TableWrap label="Visitors">
                    <thead className="bg-gray-50"><tr><Th>Name</Th><Th>Contact</Th><Th>Visited</Th><Th>Source</Th><Th>Status</Th></tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {list.data.items.map((v) => (
                        <tr key={v.id}>
                          <Td><Link to={`/visitors/${v.id}`} className="font-medium text-primary-700 hover:underline">{v.firstName} {v.lastName}</Link></Td>
                          <Td>{v.email ?? v.phone ?? '—'}</Td>
                          <Td>{formatDate(v.visitDate)}</Td>
                          <Td>{v.source ?? '—'}</Td>
                          <Td><Badge value={v.followUpStatus} /></Td>
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
      <NewVisitorModal open={creating} onClose={() => setCreating(false)} />
    </MainLayout>
  );
};
