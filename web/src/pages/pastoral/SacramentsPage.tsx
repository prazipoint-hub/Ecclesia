import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormField } from '@/components/forms/FormField';
import { Modal } from '@/components/forms/Modal';
import { Pagination, formatDate, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { apiClient } from '@/utils/api';
import { nextSacramentStep, type Baptism, type Confirmation, type Funeral, type Marriage } from '@/types/pastoral';
import { ApiError, DataState, P, PAGE_SIZE, Shell, Tag, label, memberName, td, th, today, usePagedList } from './pastoralShared';

type Kind = 'baptism' | 'confirmation' | 'marriage' | 'funeral';
const KINDS: Array<{ id: Kind; text: string; path: string }> = [
  { id: 'baptism', text: 'Baptism', path: 'baptisms' }, { id: 'confirmation', text: 'Confirmation', path: 'confirmations' },
  { id: 'marriage', text: 'Marriage', path: 'marriages' }, { id: 'funeral', text: 'Funeral', path: 'funerals' },
];

/** Extra fields the server insists on when entering a step. */
type Field = { key: string; label: string; type?: 'date' | 'text' };
export const STEP_FIELDS: Record<string, Field[]> = {
  INTERVIEWED: [{ key: 'interviewDate', label: 'Interview date', type: 'date' }],
  BAPTIZED: [{ key: 'baptismDate', label: 'Baptism date', type: 'date' }, { key: 'baptizedBy', label: 'Baptized by' }],
  CONFIRMED: [{ key: 'confirmationDate', label: 'Confirmation date', type: 'date' }, { key: 'confirmedBy', label: 'Confirmed by' }],
  MARRIED: [{ key: 'marriageDate', label: 'Marriage date', type: 'date' }, { key: 'marriedBy', label: 'Officiated by' }],
};

const AdvanceModal = ({ kind, id, step, onClose, onDone }: { kind: Exclude<Kind, 'funeral'>; id: string; step: string; onClose: () => void; onDone: () => void }) => {
  const fields = STEP_FIELDS[step] ?? [];
  const [values, setValues] = useState<Record<string, string>>({});
  const path = KINDS.find((k) => k.id === kind)!.path;
  const advance = useMutation({
    mutationFn: () => apiClient.put(`${P}/sacraments/${path}/${id}`, { status: step, ...Object.fromEntries(Object.entries(values).filter(([, v]) => v)) }),
    onSuccess: onDone,
  });
  const dateError = fields.some((f) => f.type === 'date' && values[f.key] && values[f.key] > today());
  const missing = fields.some((f) => !values[f.key]);
  const submit = (e: FormEvent) => { e.preventDefault(); if (!dateError && !missing) advance.mutate(); };
  return (
    <Modal open title={`Advance to ${label(step)}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <ApiError error={advance.error} />
        {fields.map((f) => (
          <FormField key={f.key} label={f.label} type={f.type ?? 'text'} max={f.type === 'date' ? today() : undefined} value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
        ))}
        {dateError && <p role="alert" className="text-xs text-red-600">Dates cannot be in the future.</p>}
        {fields.length === 0 && <p className="text-sm text-gray-600">Move this record to {label(step)}?</p>}
        <div className="flex justify-end gap-2"><button type="button" className={secondaryBtn} onClick={onClose}>Cancel</button><button type="submit" className={primaryBtn} disabled={advance.isPending || dateError || missing}>Advance</button></div>
      </form>
    </Modal>
  );
};

const StepList = ({ kind }: { kind: Exclude<Kind, 'funeral'> }) => {
  const queryClient = useQueryClient();
  const path = KINDS.find((k) => k.id === kind)!.path;
  const list = usePagedList<Baptism & Confirmation & Marriage>(`sacrament-${kind}`, `/sacraments/${path}`);
  const [adding, setAdding] = useState(false);
  const [ids, setIds] = useState({ a: '', b: '' });
  const [advancing, setAdvancing] = useState<{ id: string; step: string } | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['pastoral', `sacrament-${kind}`] });
  const create = useMutation({
    mutationFn: () => apiClient.post(`${P}/sacraments/${path}`, kind === 'marriage' ? { partner1Id: ids.a.trim(), partner2Id: ids.b.trim() } : { memberId: ids.a.trim() }),
    onSuccess: () => { refresh(); setAdding(false); setIds({ a: '', b: '' }); },
  });
  return (
    <div className="space-y-4">
      <div><button type="button" className={primaryBtn} onClick={() => setAdding(true)}>New {kind} record</button></div>
      <DataState query={list.query} empty={`No ${kind} records.`}>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead><tr><th className={th}>{kind === 'marriage' ? 'Couple' : 'Member'}</th><th className={th}>Status</th><th className={th} /></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {list.query.data?.items.map((r) => {
                const next = nextSacramentStep(kind, r.status);
                return (
                  <tr key={r.id}>
                    <td className={td}>{kind === 'marriage' ? `${memberName(r.partner1)} & ${memberName(r.partner2)}` : memberName(r.member)}</td>
                    <td className={td}><Tag value={r.status} /></td>
                    <td className={`${td} text-right`}>
                      {next ? <button type="button" className={secondaryBtn} onClick={() => setAdvancing({ id: r.id, step: next })}>Advance to {label(next)}</button> : <span className="text-xs text-gray-500">Final</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={list.page} pageSize={PAGE_SIZE} total={list.query.data?.total ?? 0} onPage={list.setPage} />
      </DataState>
      {advancing && <AdvanceModal kind={kind} id={advancing.id} step={advancing.step} onClose={() => setAdvancing(null)} onDone={() => { refresh(); setAdvancing(null); }} />}
      <Modal open={adding} title={`New ${kind} record`} onClose={() => setAdding(false)}>
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); if (ids.a.trim()) create.mutate(); }} className="space-y-3">
          <ApiError error={create.error} />
          <FormField label={kind === 'marriage' ? 'First partner ID' : 'Member ID'} value={ids.a} onChange={(e) => setIds({ ...ids, a: e.target.value })} />
          {kind === 'marriage' && <FormField label="Second partner ID" value={ids.b} onChange={(e) => setIds({ ...ids, b: e.target.value })} />}
          <div className="flex justify-end gap-2"><button type="button" className={secondaryBtn} onClick={() => setAdding(false)}>Cancel</button><button type="submit" className={primaryBtn} disabled={create.isPending}>Create</button></div>
        </form>
      </Modal>
    </div>
  );
};

const FuneralList = () => {
  const queryClient = useQueryClient();
  const list = usePagedList<Funeral>('sacrament-funeral', '/sacraments/funerals');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ deceasedId: '', deathDate: '' });
  const [editing, setEditing] = useState<Funeral | null>(null);
  const [edit, setEdit] = useState({ funeralDate: '', funeralLocation: '', funeralBy: '', familyNotified: false, record: false });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['pastoral', 'sacrament-funeral'] });
  const create = useMutation({
    mutationFn: () => apiClient.post(`${P}/sacraments/funerals`, { deceasedId: draft.deceasedId.trim(), deathDate: draft.deathDate }),
    onSuccess: () => { refresh(); setAdding(false); setDraft({ deceasedId: '', deathDate: '' }); },
  });
  const update = useMutation({
    mutationFn: () => apiClient.put(`${P}/sacraments/funerals/${editing!.id}`, {
      ...(edit.funeralDate && { funeralDate: edit.funeralDate }), ...(edit.funeralLocation && { funeralLocation: edit.funeralLocation }),
      ...(edit.funeralBy && { funeralBy: edit.funeralBy }), familyNotified: edit.familyNotified, ...(edit.record && { record: true }),
    }),
    onSuccess: () => { refresh(); setEditing(null); },
  });
  const startEdit = (f: Funeral) => {
    setEditing(f);
    setEdit({ funeralDate: f.funeralDate?.slice(0, 10) ?? '', funeralLocation: f.funeralLocation ?? '', funeralBy: f.funeralBy ?? '', familyNotified: f.familyNotified, record: false });
  };
  return (
    <div className="space-y-4">
      <div><button type="button" className={primaryBtn} onClick={() => setAdding(true)}>New funeral record</button></div>
      <DataState query={list.query} empty="No funeral records.">
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead><tr><th className={th}>Deceased</th><th className={th}>Died</th><th className={th}>Funeral</th><th className={th}>Family told</th><th className={th} /></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {list.query.data?.items.map((f) => (
                <tr key={f.id}>
                  <td className={td}>{memberName(f.deceased)}</td><td className={td}>{formatDate(f.deathDate)}</td><td className={td}>{formatDate(f.funeralDate)}</td>
                  <td className={td}>{f.familyNotified ? 'Yes' : 'No'}</td>
                  <td className={`${td} text-right`}>{f.recordedAt ? <span className="text-xs text-gray-500">Recorded</span> : <button type="button" className={secondaryBtn} onClick={() => startEdit(f)}>Update</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={list.page} pageSize={PAGE_SIZE} total={list.query.data?.total ?? 0} onPage={list.setPage} />
      </DataState>
      <Modal open={adding} title="New funeral record" onClose={() => setAdding(false)}>
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); if (draft.deceasedId.trim() && draft.deathDate && draft.deathDate <= today()) create.mutate(); }} className="space-y-3">
          <ApiError error={create.error} />
          <FormField label="Deceased member ID" value={draft.deceasedId} onChange={(e) => setDraft({ ...draft, deceasedId: e.target.value })} />
          <FormField label="Date of death" type="date" max={today()} value={draft.deathDate} onChange={(e) => setDraft({ ...draft, deathDate: e.target.value })} />
          <div className="flex justify-end gap-2"><button type="button" className={secondaryBtn} onClick={() => setAdding(false)}>Cancel</button><button type="submit" className={primaryBtn} disabled={create.isPending}>Create</button></div>
        </form>
      </Modal>
      <Modal open={Boolean(editing)} title="Update funeral record" onClose={() => setEditing(null)}>
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); update.mutate(); }} className="space-y-3">
          <ApiError error={update.error} />
          <FormField label="Funeral date" type="date" value={edit.funeralDate} onChange={(e) => setEdit({ ...edit, funeralDate: e.target.value })} />
          <FormField label="Location" value={edit.funeralLocation} onChange={(e) => setEdit({ ...edit, funeralLocation: e.target.value })} />
          <FormField label="Officiated by" value={edit.funeralBy} onChange={(e) => setEdit({ ...edit, funeralBy: e.target.value })} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.familyNotified} onChange={(e) => setEdit({ ...edit, familyNotified: e.target.checked })} /> Family notified</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.record} onChange={(e) => setEdit({ ...edit, record: e.target.checked })} /> Record and finalise (cannot be changed afterwards)</label>
          <div className="flex justify-end gap-2"><button type="button" className={secondaryBtn} onClick={() => setEditing(null)}>Cancel</button><button type="submit" className={primaryBtn} disabled={update.isPending}>Save</button></div>
        </form>
      </Modal>
    </div>
  );
};

export const SacramentsPage = () => {
  const [kind, setKind] = useState<Kind>('baptism');
  return (
    <Shell title="Sacraments" subtitle="Baptism, confirmation, marriage and funeral records." permission="pastoral:sacrament:manage">
      <div role="tablist" className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button key={k.id} role="tab" type="button" aria-selected={kind === k.id} onClick={() => setKind(k.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${kind === k.id ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700'}`}>{k.text}</button>
        ))}
      </div>
      {kind === 'funeral' ? <FuneralList /> : <StepList key={kind} kind={kind} />}
    </Shell>
  );
};
