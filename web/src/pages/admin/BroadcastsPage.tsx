import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { FormSelect } from '@/components/forms/FormSelect';
import { FormTextarea } from '@/components/forms/FormTextarea';
import { Modal } from '@/components/forms/Modal';
import { EmptyBlock, ErrorBlock, LoadingBlock, Pagination, card, formatDate, primaryBtn, secondaryBtn, titleCase } from '@/pages/account/shared';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { useAuthStore } from '@stores/authStore';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  CATEGORY_LABELS,
  CHANNEL_LABELS,
  can,
  type Audience,
  type Broadcast,
  type BroadcastChannel,
  type BroadcastInput,
  type BroadcastList,
  type BroadcastStatus,
  type NotificationCategory,
  type TemplateList,
} from '@/types/notifications';
import { AdminHeader, NoAccess } from './adminShared';
import { TEMPLATES_KEY } from './TemplatesPage';

const CREATE = 'notification:broadcast:create';
const SEND = 'notification:broadcast:send';
const PAGE_SIZE = 20;
const LIST_KEY = ['notifications', 'broadcasts'] as const;
const detailKey = (id: string) => ['notifications', 'broadcast', id] as const;

const STATUS_STYLES: Record<BroadcastStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SCHEDULED: 'bg-blue-100 text-blue-800',
  SENDING: 'bg-amber-100 text-amber-800',
  SENT: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

export const StatusBadge = ({ status }: { status: BroadcastStatus }) => (
  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}>{titleCase(status)}</span>
);

const CHANNEL_OPTIONS: Array<{ value: BroadcastChannel; disabledReason?: string }> = [
  { value: 'IN_APP' },
  { value: 'EMAIL' },
  { value: 'SMS', disabledReason: 'No SMS provider configured' },
];

const isValidAudience = (audience: Audience) => audience.type === 'ALL' || audience.ids.length > 0;

const useAudiencePreview = (audience: Audience, enabled: boolean) =>
  useQuery({
    queryKey: ['notifications', 'audience-preview', audience],
    queryFn: async () => (await apiClient.post<{ recipients: number }>('/api/v2/notifications/broadcasts/audience-preview', { audience })).data.recipients,
    enabled: enabled && isValidAudience(audience),
  });

type Unit = { id: string; name: string };

const useAudienceUnits = (type: 'SECTIONS' | 'ORGANIZATIONS' | 'ALL') => {
  const churchId = useAuthStore((state) => state.user?.churchId);
  return useQuery({
    queryKey: ['notifications', 'audience-units', type, churchId],
    enabled: type !== 'ALL' && Boolean(churchId),
    queryFn: async (): Promise<Unit[]> => {
      if (type === 'SECTIONS') {
        const { data } = await apiClient.get<{ sections: Unit[] }>('/api/v2/sections', { params: { churchId, take: 200 } });
        return data.sections;
      }
      const { data } = await apiClient.get<{ organizations: Unit[] }>('/api/v2/organizations', { params: { churchId, take: 200 } });
      return data.organizations;
    },
  });
};

// ------------------------------------------------------------------- form

const BroadcastForm = ({ initial, onSaved, onCancel }: { initial?: Broadcast; onSaved: (b: Broadcast) => void; onCancel: () => void }) => {
  const queryClient = useQueryClient();
  const permissions = useAuthStore((state) => state.user?.permissions);
  const canUseTemplates = can(permissions, 'notification:template:manage');

  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [category, setCategory] = useState<NotificationCategory>(initial?.category ?? 'ANNOUNCEMENTS');
  const [channels, setChannels] = useState<BroadcastChannel[]>(initial?.channels ?? ['IN_APP', 'EMAIL']);
  const [audience, setAudience] = useState<Audience>(initial?.audience ?? { type: 'ALL' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const templates = useQuery({
    queryKey: TEMPLATES_KEY,
    queryFn: async () => (await apiClient.get<TemplateList>('/api/v2/notifications/templates')).data,
    enabled: canUseTemplates,
  });
  const units = useAudienceUnits(audience.type);
  const preview = useAudiencePreview(audience, true);

  const save = useMutation({
    mutationFn: async (input: BroadcastInput) =>
      initial
        ? (await apiClient.put<Broadcast>(`/api/v2/notifications/broadcasts/${initial.id}`, input)).data
        : (await apiClient.post<Broadcast>('/api/v2/notifications/broadcasts', input)).data,
    onSuccess: (broadcast) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.setQueryData(detailKey(broadcast.id), broadcast);
      onSaved(broadcast);
    },
  });

  const toggleChannel = (channel: BroadcastChannel) =>
    setChannels((prev) => (prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]));

  const toggleUnit = (id: string) =>
    setAudience((prev) =>
      prev.type === 'ALL' ? prev : { ...prev, ids: prev.ids.includes(id) ? prev.ids.filter((x) => x !== id) : [...prev.ids, id] }
    );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = 'Enter a title.';
    if (!body.trim()) next.body = 'Enter the message.';
    if (channels.length === 0) next.channels = 'Choose at least one channel.';
    if (!isValidAudience(audience)) next.audience = 'Choose at least one group, or send to everyone.';
    setErrors(next);
    if (Object.keys(next).length === 0) save.mutate({ title: title.trim(), body: body.trim(), category, audience, channels });
  };

  return (
    <form onSubmit={submit} noValidate className={`${card} space-y-4`} aria-label={initial ? 'Edit broadcast' : 'New broadcast'}>
      <h2 className="text-lg font-semibold text-gray-900">{initial ? 'Edit broadcast' : 'New broadcast'}</h2>

      {canUseTemplates && templates.data && templates.data.items.length > 0 && (
        <FormSelect
          label="Start from a template"
          placeholder="Choose a template…"
          value=""
          options={templates.data.items.map((t) => ({ value: t.id, label: t.name }))}
          onChange={(event) => {
            const template = templates.data?.items.find((t) => t.id === event.target.value);
            if (template) {
              setTitle(template.subject);
              setBody(template.body);
            }
          }}
        />
      )}

      <FormField label="Title" value={title} maxLength={150} error={errors.title} onChange={(e) => setTitle(e.target.value)} />
      <FormTextarea label="Message" value={body} maxLength={5000} rows={6} error={errors.body} onChange={(e) => setBody(e.target.value)} />
      <p className="-mt-2 text-xs text-gray-500">You can use {'{{firstName}}'}, {'{{lastName}}'} and {'{{churchName}}'}.</p>

      <FormSelect
        label="Category"
        value={category}
        options={(Object.keys(CATEGORY_LABELS) as NotificationCategory[]).map((value) => ({ value, label: CATEGORY_LABELS[value] }))}
        onChange={(e) => setCategory(e.target.value as NotificationCategory)}
      />

      <fieldset>
        <legend className="mb-1 text-sm font-medium text-gray-700">Channels</legend>
        <div className="flex flex-wrap gap-4">
          {CHANNEL_OPTIONS.map(({ value, disabledReason }) => (
            <label key={value} className={`flex items-center gap-2 text-sm ${disabledReason ? 'text-gray-400' : 'text-gray-700'}`}>
              <input
                type="checkbox"
                checked={channels.includes(value)}
                disabled={Boolean(disabledReason)}
                onChange={() => toggleChannel(value)}
                className="h-4 w-4 rounded border-gray-300 text-primary-600"
              />
              {CHANNEL_LABELS[value]}
              {disabledReason && <span className="text-xs">({disabledReason})</span>}
            </label>
          ))}
        </div>
        {errors.channels && <p role="alert" className="mt-1 text-xs text-red-600">{errors.channels}</p>}
        <p className="mt-1 text-xs text-gray-500">Members who opted out of a channel for this category are skipped.</p>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-sm font-medium text-gray-700">Send to</legend>
        <FormSelect
          label="Audience"
          value={audience.type}
          options={[
            { value: 'ALL', label: 'All active members' },
            { value: 'SECTIONS', label: 'Specific sections' },
            { value: 'ORGANIZATIONS', label: 'Specific organizations' },
          ]}
          onChange={(e) => setAudience(e.target.value === 'ALL' ? { type: 'ALL' } : { type: e.target.value as 'SECTIONS' | 'ORGANIZATIONS', ids: [] })}
        />
        {audience.type !== 'ALL' && (
          <div className="mt-3">
            {units.isLoading && <LoadingBlock />}
            {units.isError && <ErrorBlock error={units.error} onRetry={() => units.refetch()} />}
            {units.data && units.data.length === 0 && <p className="text-sm text-gray-500">Nothing to choose from.</p>}
            <ul className="grid gap-1 sm:grid-cols-2">
              {units.data?.map((unit) => (
                <li key={unit.id}>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={audience.ids.includes(unit.id)} onChange={() => toggleUnit(unit.id)} className="h-4 w-4 rounded border-gray-300 text-primary-600" />
                    {unit.name}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
        {errors.audience && <p role="alert" className="mt-1 text-xs text-red-600">{errors.audience}</p>}
        <p className="mt-2 text-sm text-gray-600" aria-live="polite">
          {isValidAudience(audience) ? (preview.isLoading ? 'Counting recipients…' : preview.isError ? 'Could not count recipients.' : `${preview.data ?? 0} recipients`) : ' '}
        </p>
      </fieldset>

      {save.error != null && <ErrorNotice message={getApiErrorMessage(save.error)} />}
      <div className="flex justify-end gap-2">
        <button type="button" className={secondaryBtn} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={primaryBtn} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save draft'}
        </button>
      </div>
    </form>
  );
};

// ----------------------------------------------------------------- detail

const toLocalInput = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

const BroadcastDetail = ({ id, canSend, onEdit, onClose }: { id: string; canSend: boolean; onEdit: (b: Broadcast) => void; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [when, setWhen] = useState('');
  const [whenError, setWhenError] = useState<string | null>(null);

  const broadcast = useQuery({
    queryKey: detailKey(id),
    queryFn: async () => (await apiClient.get<Broadcast>(`/api/v2/notifications/broadcasts/${id}`)).data,
    refetchInterval: (query) => (query.state.data?.status === 'SENDING' ? 3000 : false),
  });
  const data = broadcast.data;
  const preview = useAudiencePreview(data?.audience ?? { type: 'ALL' }, confirmOpen && Boolean(data));

  const apply = (updated: Broadcast) => {
    queryClient.setQueryData(detailKey(id), updated);
    queryClient.invalidateQueries({ queryKey: LIST_KEY });
  };

  const action = useMutation({
    mutationFn: async (request: { path: string; body?: unknown }) =>
      (await apiClient.post<Broadcast>(`/api/v2/notifications/broadcasts/${id}/${request.path}`, request.body)).data,
    onSuccess: (updated) => {
      setConfirmOpen(false);
      apply(updated);
    },
  });

  const editable = data?.status === 'DRAFT';
  const schedulable = data?.status === 'DRAFT' || data?.status === 'SCHEDULED';

  const schedule = () => {
    const date = new Date(when);
    if (!when || Number.isNaN(date.getTime())) return setWhenError('Choose a date and time.');
    if (date.getTime() < Date.now() + 60_000) return setWhenError('Choose a time at least a minute from now.');
    setWhenError(null);
    action.mutate({ path: 'schedule', body: { scheduledAt: date.toISOString() } });
  };

  return (
    <section className={`${card} space-y-4`} aria-label="Broadcast details">
      {broadcast.isLoading && <LoadingBlock />}
      {broadcast.isError && <ErrorBlock error={broadcast.error} onRetry={() => broadcast.refetch()} />}
      {data && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{data.title}</h2>
              <p className="text-sm text-gray-500">
                {CATEGORY_LABELS[data.category]} · {data.channels.map((c) => CHANNEL_LABELS[c]).join(', ')} ·{' '}
                {data.audience.type === 'ALL' ? 'All active members' : `${data.audience.ids.length} ${data.audience.type === 'SECTIONS' ? 'sections' : 'organizations'}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={data.status} />
              <button type="button" className={secondaryBtn} onClick={onClose}>
                Close
              </button>
            </div>
          </div>
          <p className="whitespace-pre-line text-sm text-gray-700">{data.body}</p>
          {data.status === 'SCHEDULED' && data.scheduledAt && <p className="text-sm text-blue-800">Scheduled for {new Date(data.scheduledAt).toLocaleString()}.</p>}
          {data.status === 'SENDING' && <p role="status" className="text-sm text-amber-800">Sending… this page updates automatically.</p>}

          {(data.status === 'SENT' || data.status === 'FAILED') && (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Delivery results">
              {[
                ['Recipients', data.recipientCount],
                ['Delivered', data.deliveredCount],
                ['Skipped', data.skippedCount],
                ['Failed', data.failedCount],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-gray-50 p-3">
                  <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
                  <dd className="text-xl font-bold text-gray-900">{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {data.status === 'FAILED' && <ErrorNotice message="Delivery stopped part-way. The counts above show what was sent before the failure." />}

          {action.error != null && <ErrorNotice message={getApiErrorMessage(action.error)} />}

          <div className="flex flex-wrap items-end gap-3">
            {editable && (
              <button type="button" className={secondaryBtn} onClick={() => onEdit(data)}>
                Edit
              </button>
            )}
            {canSend && schedulable && (
              <button type="button" className={primaryBtn} onClick={() => { action.reset(); setConfirmOpen(true); }}>
                Send now
              </button>
            )}
            {canSend && schedulable && (
              <div className="flex items-end gap-2">
                <FormField
                  label="Schedule for"
                  type="datetime-local"
                  value={when}
                  min={toLocalInput(new Date(Date.now() + 60_000))}
                  error={whenError ?? undefined}
                  onChange={(e) => setWhen(e.target.value)}
                />
                <button type="button" className={secondaryBtn} onClick={schedule} disabled={action.isPending}>
                  Schedule
                </button>
              </div>
            )}
            {canSend && schedulable && (
              <button type="button" className={secondaryBtn} onClick={() => action.mutate({ path: 'cancel' })} disabled={action.isPending}>
                Cancel broadcast
              </button>
            )}
          </div>

          <Modal
            open={confirmOpen}
            title="Send this broadcast?"
            onClose={() => setConfirmOpen(false)}
            footer={
              <>
                <button type="button" className={secondaryBtn} onClick={() => setConfirmOpen(false)}>
                  Go back
                </button>
                <button type="button" className={primaryBtn} disabled={action.isPending || preview.isLoading} onClick={() => action.mutate({ path: 'send' })}>
                  {action.isPending ? 'Sending…' : 'Send now'}
                </button>
              </>
            }
          >
            <p className="text-sm text-gray-700">
              “{data.title}” will be sent now to{' '}
              <strong>{preview.isLoading ? '…' : preview.isError ? 'an unknown number of' : preview.data ?? 0} members</strong> by{' '}
              {data.channels.map((c) => CHANNEL_LABELS[c]).join(' and ')}. This cannot be undone.
            </p>
            {action.error != null && <div className="mt-3"><ErrorNotice message={getApiErrorMessage(action.error)} /></div>}
          </Modal>
        </>
      )}
    </section>
  );
};

// ------------------------------------------------------------------- page

export const BroadcastsPage = () => {
  const permissions = useAuthStore((state) => state.user?.permissions);
  const allowed = can(permissions, CREATE);
  const canSend = can(permissions, SEND);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [form, setForm] = useState<{ initial?: Broadcast } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: [...LIST_KEY, page, status],
    queryFn: async () =>
      (await apiClient.get<BroadcastList>('/api/v2/notifications/broadcasts', { params: { page, pageSize: PAGE_SIZE, ...(status ? { status } : {}) } })).data,
    enabled: allowed,
    placeholderData: (previous) => previous,
  });

  return (
    <MainLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <AdminHeader
          title="Broadcasts"
          subtitle="Send announcements to members by in-app message and email."
          action={allowed && !form && (
            <button type="button" className={primaryBtn} onClick={() => { setSelectedId(null); setForm({}); }}>
              New broadcast
            </button>
          )}
        />
        {!allowed && <NoAccess permission={CREATE} />}

        {allowed && form && (
          <BroadcastForm
            initial={form.initial}
            onCancel={() => setForm(null)}
            onSaved={(saved) => {
              setForm(null);
              setSelectedId(saved.id);
            }}
          />
        )}

        {allowed && !form && selectedId && (
          <BroadcastDetail id={selectedId} canSend={canSend} onClose={() => setSelectedId(null)} onEdit={(b) => setForm({ initial: b })} />
        )}

        {allowed && (
          <section className={card} aria-label="Broadcast list">
            <div className="mb-4 max-w-xs">
              <FormSelect
                label="Status"
                value={status}
                placeholder="All"
                options={(['DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED'] as BroadcastStatus[]).map((value) => ({ value, label: titleCase(value) }))}
                onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              />
            </div>
            {list.isLoading && <LoadingBlock />}
            {list.isError && <ErrorBlock error={list.error} onRetry={() => list.refetch()} />}
            {list.data && list.data.items.length === 0 && <EmptyBlock message="No broadcasts yet." />}
            {list.data && list.data.items.length > 0 && (
              <ul className="divide-y divide-gray-100">
                {list.data.items.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-900">{b.title}</p>
                      <p className="text-xs text-gray-500">
                        {formatDate(b.sentAt ?? b.scheduledAt ?? b.createdAt)} · {b.channels.map((c) => CHANNEL_LABELS[c]).join(', ')}
                        {b.status === 'SENT' && ` · ${b.deliveredCount} delivered`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={b.status} />
                      <button
                        type="button"
                        className="text-sm font-medium text-primary-600 hover:text-primary-700"
                        aria-label={`Open ${b.title}`}
                        onClick={() => { setForm(null); setSelectedId(b.id); }}
                      >
                        Open
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {list.data && <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPage={setPage} />}
          </section>
        )}
      </div>
    </MainLayout>
  );
};

export default BroadcastsPage;
