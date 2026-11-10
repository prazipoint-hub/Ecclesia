import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormField } from '@/components/forms/FormField';
import { ErrorBlock, LoadingBlock, card, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { ApiError } from '@/pages/finance/financeShared';
import { apiClient } from '@/utils/api';

const ME = '/api/v2/me/profile-completion';
export const MAX_PHOTO_KB = 300;
interface Field { key: string; label: string; type: 'TEXT' | 'DATE' | 'NUMBER' | 'CHOICE'; options: string[] | null; required: boolean; value: string }

/** Church-defined extra details, for the signed-in member (`path` = ME) or a child in their care. */
export const ExtraFields = ({ path = ME, title = 'More about you' }: { path?: string; title?: string }) => {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['profile-extra', path], queryFn: async () => (await apiClient.get<{ fields: Field[] }>(`${path}/fields`)).data.fields });
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => { if (q.data) setDraft(Object.fromEntries(q.data.map((f) => [f.key, f.value]))); }, [q.data]);
  const save = useMutation({
    mutationFn: () => apiClient.put(`${path}/fields`, { values: Object.fromEntries((q.data ?? []).filter((f) => (draft[f.key] ?? '') !== f.value).map((f) => [f.key, draft[f.key] ?? ''])) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['profile-extra', path] }); void qc.invalidateQueries({ queryKey: ['me', 'profile-completion'] }); void qc.invalidateQueries({ queryKey: ['dependants'] }); },
  });
  if (q.isLoading) return <LoadingBlock />;
  if (q.error) return <ErrorBlock error={q.error} />;
  if (!q.data?.length) return null;
  const changed = q.data.some((f) => (draft[f.key] ?? '') !== f.value);
  return (
    <section className={card} aria-label={title}>
      <h2 className="mb-3 text-lg font-medium text-gray-900">{title}</h2>
      {save.error && <ApiError error={save.error} />}
      <div className="grid gap-3 sm:grid-cols-2">
        {q.data.map((f) => f.type === 'CHOICE' ? (
          <label key={f.key} className="block text-sm font-medium text-gray-700">{f.label}{f.required && ' *'}
            <select className="mt-1 block w-full rounded-lg border-gray-300" value={draft[f.key] ?? ''} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}>
              <option value="">Choose…</option>{f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        ) : <FormField key={f.key} label={`${f.label}${f.required ? ' *' : ''}`} type={f.type === 'DATE' ? 'date' : f.type === 'NUMBER' ? 'number' : 'text'} value={draft[f.key] ?? ''} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />)}
      </div>
      <button type="button" className={`${primaryBtn} mt-3`} disabled={!changed || save.isPending} onClick={() => save.mutate()}>Save</button>
    </section>
  );
};

/** Photo preview fetched with the sign-in token (an <img> tag cannot send it), shown from a local object URL. */
export const PhotoControl = ({ path = ME, label = 'Profile photo' }: { path?: string; label?: string }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const load = async () => {
    try {
      const r = await apiClient.get<Blob>(`${path}/photo`, { responseType: 'blob' });
      setUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(r.data); });
    } catch { setUrl(null); }
  };
  useEffect(() => { void load(); return () => setUrl((old) => { if (old) URL.revokeObjectURL(old); return null; }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [path]);
  const upload = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Choose a JPEG, PNG or WebP picture.'); return; }
    if (file.size > MAX_PHOTO_KB * 1024) { setError(`The picture must be ${MAX_PHOTO_KB} KB or smaller.`); return; }
    try { await apiClient.put(`${path}/photo`, await file.arrayBuffer(), { headers: { 'Content-Type': file.type } }); await load(); } catch { setError('The picture could not be saved.'); }
  };
  const remove = async () => { try { await apiClient.delete(`${path}/photo`); setUrl(null); } catch { setError('The picture could not be removed.'); } };
  return (
    <div className="flex items-center gap-4" aria-label={label}>
      <div className="h-20 w-20 overflow-hidden rounded-full bg-gray-100">{url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-xs text-gray-400">No photo</span>}</div>
      <div className="space-y-1">
        <div className="flex gap-2">
          <button type="button" className={secondaryBtn} onClick={() => input.current?.click()}>{url ? 'Change photo' : 'Add photo'}</button>
          {url && <button type="button" className={secondaryBtn} onClick={() => void remove()}>Remove</button>}
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label={`${label} file`} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </div>
    </div>
  );
};

interface Dependant { memberId: string; name: string; relationship: string; percent: number; missing: string[] }
/** Children an administrator has linked to the signed-in guardian. Access ends by itself at 18. */
export const Dependants = () => {
  const q = useQuery({ queryKey: ['dependants'], queryFn: async () => (await apiClient.get<{ dependants: Dependant[] }>(`${ME}/dependants`)).data.dependants });
  const [open, setOpen] = useState<string | null>(null);
  if (!q.data?.length) return null;
  return (
    <section className={card} aria-label="Children in your care">
      <h2 className="mb-3 text-lg font-medium text-gray-900">Children in your care</h2>
      <ul className="space-y-3">
        {q.data.map((d) => (
          <li key={d.memberId} className="rounded-lg border border-gray-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-gray-900">{d.name} <span className="text-sm font-normal text-gray-500">{d.percent}% complete</span></span><button type="button" className={secondaryBtn} onClick={() => setOpen(open === d.memberId ? null : d.memberId)}>{open === d.memberId ? 'Close' : 'Update details'}</button></div>
            {open === d.memberId && <div className="mt-3 space-y-4"><PhotoControl path={`${ME}/dependants/${d.memberId}`} label={`${d.name} photo`} /><ExtraFields path={`${ME}/dependants/${d.memberId}`} title={`More about ${d.name}`} /></div>}
          </li>
        ))}
      </ul>
    </section>
  );
};
