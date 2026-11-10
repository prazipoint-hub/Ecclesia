import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy } from 'lucide-react';
import { card, formatDate, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import type { CalendarFeed, CreatedCalendarFeed } from '@/types/advanced';
import { inputCls } from './shared';

/** The API base the browser actually talks to, so the link works from a calendar app outside this site. */
const apiOrigin = (): string => String(apiClient.defaults.baseURL ?? window.location.origin).replace(/\/$/, '');

export const CalendarFeedsCard = () => {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [shown, setShown] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const feeds = useQuery({ queryKey: ['calendar-feeds'], queryFn: async () => (await apiClient.get<CalendarFeed[]>('/api/v2/calendar/feeds')).data });
  const create = useMutation({
    mutationFn: async () => (await apiClient.post<CreatedCalendarFeed>('/api/v2/calendar/feeds', label.trim() ? { label: label.trim() } : {})).data,
    onSuccess: (feed) => { setShown(`${apiOrigin()}${feed.path}`); setLabel(''); setCopied(false); queryClient.invalidateQueries({ queryKey: ['calendar-feeds'] }); },
  });
  const revoke = useMutation({ mutationFn: async (id: string) => apiClient.delete(`/api/v2/calendar/feeds/${id}`), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['calendar-feeds'] }) });
  const copy = async () => {
    if (!shown) return;
    try { await navigator.clipboard.writeText(shown); setCopied(true); } catch { setCopied(false); }
  };
  const active = feeds.data?.filter((f) => !f.revokedAt) ?? [];
  return (
    <section className={`${card} space-y-4`} aria-labelledby="calendar-title">
      <div>
        <h2 id="calendar-title" className="text-lg font-medium text-gray-900">Calendar subscription</h2>
        <p className="mt-1 text-sm text-gray-600">Add church events to Google Calendar, Outlook or Apple Calendar with a private link. Anyone with the link can see the church event list, so keep it to yourself.</p>
      </div>
      {shown && (
        <div role="status" className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900">Copy this link now. It is shown only once.</p>
          <code className="block break-all rounded bg-white p-2 text-xs">{shown}</code>
          <div className="flex gap-2">
            <button type="button" onClick={copy} className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium">{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? 'Copied' : 'Copy link'}</button>
            <button type="button" onClick={() => setShown(null)} className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium">I have copied it</button>
          </div>
        </div>
      )}
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <label className="text-sm font-medium text-gray-700">Label (optional)<input className={`${inputCls} mt-1`} maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} /></label>
        <button type="submit" className={primaryBtn} disabled={create.isPending}>Create link</button>
      </form>
      {(create.error ?? revoke.error) != null && <ErrorNotice message={getApiErrorMessage(create.error ?? revoke.error)} />}
      {active.length > 0 && (
        <ul className="divide-y divide-gray-100 text-sm">
          {active.map((f) => (
            <li key={f.id} className="flex items-center justify-between py-2">
              <span>{f.label || 'Calendar link'} <span className="text-xs text-gray-500">· created {formatDate(f.createdAt)}{f.lastUsedAt ? ` · last used ${formatDate(f.lastUsedAt)}` : ' · never used'}</span></span>
              <button type="button" className={secondaryBtn} onClick={() => revoke.mutate(f.id)}>Revoke</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
