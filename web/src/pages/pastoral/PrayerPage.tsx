import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormField } from '@/components/forms/FormField';
import { FormSelect } from '@/components/forms/FormSelect';
import { FormTextarea } from '@/components/forms/FormTextarea';
import { Modal } from '@/components/forms/Modal';
import { Pagination, card, formatDate, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { apiClient } from '@/utils/api';
import { PRAYER_STATUSES, PRAYER_VISIBILITY, type Prayer, type WallPrayer } from '@/types/pastoral';
import { ApiError, DataState, P, PAGE_SIZE, Shell, Tag, label, memberName, selectOptions, usePagedList, usePermissions } from './pastoralShared';

type Tab = 'mine' | 'wall' | 'manage';

const MyRequests = () => {
  const queryClient = useQueryClient();
  const list = usePagedList<Prayer>('prayer-mine', '/prayer/mine');
  const [draft, setDraft] = useState({ request: '', visibility: 'PASTOR_ONLY' });
  const [error, setError] = useState('');
  const submit = useMutation({
    mutationFn: () => apiClient.post(`${P}/prayer`, { request: draft.request.trim(), visibility: draft.visibility }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['pastoral', 'prayer-mine'] }); setDraft({ request: '', visibility: 'PASTOR_ONLY' }); },
  });
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (draft.request.trim().length < 10) return setError('Please write at least 10 characters.');
    setError('');
    submit.mutate();
  };
  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className={`${card} space-y-3`}>
        <h2 className="text-lg font-semibold">Ask for prayer</h2>
        <ApiError error={submit.error} />
        <FormTextarea label="Your request" value={draft.request} onChange={(e) => setDraft({ ...draft, request: e.target.value })} error={error} />
        <FormSelect label="Who can see this" value={draft.visibility} options={selectOptions(PRAYER_VISIBILITY)} onChange={(e) => setDraft({ ...draft, visibility: e.target.value })} />
        <button type="submit" className={primaryBtn} disabled={submit.isPending}>Send request</button>
      </form>
      <DataState query={list.query} empty="You have not asked for prayer yet.">
        <ul className={`${card} divide-y divide-gray-100`}>
          {list.query.data?.items.map((p) => (
            <li key={p.id} className="py-2 text-sm"><p>{p.request}</p><p className="mt-1 text-xs text-gray-500">{formatDate(p.submitted)} · {label(p.visibility)} · <Tag value={p.status} /></p></li>
          ))}
        </ul>
        <Pagination page={list.page} pageSize={PAGE_SIZE} total={list.query.data?.total ?? 0} onPage={list.setPage} />
      </DataState>
    </div>
  );
};

const Wall = () => {
  const list = usePagedList<WallPrayer>('prayer-wall', '/prayer/wall');
  return (
    <DataState query={list.query} empty="No shared prayer requests right now.">
      <ul className={`${card} divide-y divide-gray-100`}>
        {list.query.data?.items.map((p) => (
          <li key={p.id} className="py-2 text-sm"><p>{p.request}</p><p className="mt-1 text-xs text-gray-500">{p.firstName} · {formatDate(p.submitted)}</p></li>
        ))}
      </ul>
      <Pagination page={list.page} pageSize={PAGE_SIZE} total={list.query.data?.total ?? 0} onPage={list.setPage} />
    </DataState>
  );
};

const Manage = () => {
  const has = usePermissions();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const list = usePagedList<Prayer>('prayer-manage', '/prayer', { status });
  const [closing, setClosing] = useState<Prayer | null>(null);
  const [reason, setReason] = useState('');
  const [reveal, setReveal] = useState<Prayer | null>(null);
  const [justification, setJustification] = useState('');
  const [revealed, setRevealed] = useState<string | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['pastoral', 'prayer-manage'] });
  const change = useMutation({
    mutationFn: ({ id, ...body }: { id: string; status: string; closedReason?: string }) => apiClient.put(`${P}/prayer/${id}/status`, body),
    onSuccess: () => { refresh(); setClosing(null); setReason(''); },
  });
  const open = useQuery({
    queryKey: ['pastoral', 'prayer-open', reveal?.id, justification],
    enabled: false,
    queryFn: async () => (await apiClient.get<Prayer>(`${P}/prayer/${reveal!.id}`, { params: { justification } })).data,
  });
  const doReveal = async () => {
    const result = await open.refetch();
    if (result.data) setRevealed(result.data.request);
  };
  const canManage = has('pastoral:prayer:manage');

  return (
    <div className="space-y-4">
      <FormSelect label="Status" value={status} placeholder="All" options={selectOptions(PRAYER_STATUSES)} onChange={(e) => setStatus(e.target.value)} className="max-w-xs" />
      <ApiError error={change.error} />
      <DataState query={list.query} empty="No prayer requests.">
        <ul className={`${card} divide-y divide-gray-100`}>
          {list.query.data?.items.map((p) => (
            <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p>{p.request}</p>
                <p className="mt-1 text-xs text-gray-500">{memberName(p.member)} · {formatDate(p.submitted)} · {label(p.visibility)} · <Tag value={p.status} /></p>
              </div>
              <div className="flex flex-wrap gap-2">
                {p.visibility === 'CONFIDENTIAL' && has('pastoral:l4:access') && (
                  <button type="button" className={secondaryBtn} onClick={() => { setReveal(p); setRevealed(null); setJustification(''); }}>Open with justification</button>
                )}
                {canManage && p.status !== 'CLOSED' && PRAYER_STATUSES.filter((s) => s !== p.status && s !== 'CLOSED').map((s) => (
                  <button key={s} type="button" className={secondaryBtn} disabled={change.isPending} onClick={() => change.mutate({ id: p.id, status: s })}>{label(s)}</button>
                ))}
                {canManage && p.status !== 'CLOSED' && <button type="button" className={secondaryBtn} onClick={() => setClosing(p)}>Close</button>}
              </div>
            </li>
          ))}
        </ul>
        <Pagination page={list.page} pageSize={PAGE_SIZE} total={list.query.data?.total ?? 0} onPage={list.setPage} />
      </DataState>
      <Modal open={Boolean(closing)} title="Close prayer request" onClose={() => setClosing(null)}>
        <div className="space-y-3">
          <FormField label="Reason for closing" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex justify-end gap-2"><button type="button" className={secondaryBtn} onClick={() => setClosing(null)}>Cancel</button>
            <button type="button" className={primaryBtn} disabled={reason.trim().length < 3 || change.isPending} onClick={() => closing && change.mutate({ id: closing.id, status: 'CLOSED', closedReason: reason.trim() })}>Close request</button></div>
        </div>
      </Modal>
      <Modal open={Boolean(reveal)} title="Open confidential request" onClose={() => setReveal(null)}>
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Reading a confidential request is recorded in the audit log with your justification.</p>
          <ApiError error={open.error} />
          {revealed ? <p className="whitespace-pre-wrap rounded bg-amber-50 p-3 text-sm">{revealed}</p> : (
            <>
              <FormField label="Justification" value={justification} onChange={(e) => setJustification(e.target.value)} hint="At least 10 characters." />
              <div className="flex justify-end"><button type="button" className={primaryBtn} disabled={justification.trim().length < 10 || open.isFetching} onClick={() => void doReveal()}>Open request</button></div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
};

export const PrayerPage = () => {
  const has = usePermissions();
  const canManageTab = has('pastoral:prayer:view');
  const [tab, setTab] = useState<Tab>('mine');
  const tabs: Array<{ id: Tab; text: string }> = [{ id: 'mine', text: 'My requests' }, { id: 'wall', text: 'Prayer wall' }, ...(canManageTab ? [{ id: 'manage' as Tab, text: 'Manage' }] : [])];
  return (
    <Shell title="Prayer" subtitle="Ask for prayer and pray for others.">
      <div role="tablist" className="flex gap-2">
        {tabs.map((t) => (
          <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === t.id ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700'}`}>{t.text}</button>
        ))}
      </div>
      {tab === 'mine' && <MyRequests />}
      {tab === 'wall' && <Wall />}
      {tab === 'manage' && canManageTab && <Manage />}
    </Shell>
  );
};
