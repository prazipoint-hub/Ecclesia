import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormField } from '@/components/forms/FormField';
import { EmptyBlock, LoadingBlock, card, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { ApiError, td, th } from '@/pages/finance/financeShared';
import { apiClient } from '@/utils/api';

const A = '/api/v2/profile-admin';
interface Def { id: string; key: string; label: string; fieldType: string; required: boolean; active: boolean }
interface Guardian { id: string; guardianMemberId: string; minorMemberId: string; relationship: string }

export const FieldDefinitions = () => {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['profile-admin', 'fields'], queryFn: async () => (await apiClient.get<{ fields: Def[] }>(`${A}/fields`)).data.fields });
  const [f, setF] = useState({ key: '', label: '', fieldType: 'TEXT', options: '', required: false });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['profile-admin'] });
  const create = useMutation({
    mutationFn: () => apiClient.post(`${A}/fields`, { key: f.key, label: f.label, fieldType: f.fieldType, required: f.required, ...(f.fieldType === 'CHOICE' && { options: f.options.split(',').map((o) => o.trim()).filter(Boolean) }) }),
    onSuccess: () => { setF({ key: '', label: '', fieldType: 'TEXT', options: '', required: false }); refresh(); },
  });
  const update = useMutation({ mutationFn: (v: { id: string; body: Record<string, unknown> }) => apiClient.put(`${A}/fields/${v.id}`, v.body), onSuccess: refresh });
  return (
    <section className={card} aria-label="Extra profile fields">
      <h2 className="mb-1 text-lg font-semibold text-gray-900">Extra profile fields</h2>
      <p className="mb-3 text-sm text-gray-600">Details your church wants beyond the standard ones. A required field counts toward each member's completion.</p>
      {(create.error || update.error) && <ApiError error={create.error ?? update.error} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Short name (letters, digits, underscore)" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value.toLowerCase() })} />
        <FormField label="Label members see" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
        <label className="block text-sm font-medium text-gray-700">Type
          <select className="mt-1 block w-full rounded-lg border-gray-300" value={f.fieldType} onChange={(e) => setF({ ...f, fieldType: e.target.value })}><option value="TEXT">Text</option><option value="DATE">Date</option><option value="NUMBER">Number</option><option value="CHOICE">Choice</option></select>
        </label>
        {f.fieldType === 'CHOICE' && <FormField label="Choices, separated by commas" value={f.options} onChange={(e) => setF({ ...f, options: e.target.value })} />}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.required} onChange={(e) => setF({ ...f, required: e.target.checked })} />Required for completion</label>
      </div>
      <button type="button" className={`${primaryBtn} mt-3`} disabled={create.isPending || f.key.length < 2 || f.label.trim().length < 2} onClick={() => create.mutate()}>Add field</button>
      {q.isLoading ? <LoadingBlock /> : !q.data?.length ? <div className="mt-3"><EmptyBlock message="No extra fields yet." /></div> : (
        <div className="mt-4 overflow-x-auto"><table className="w-full"><caption className="sr-only">Extra fields</caption>
          <thead><tr><th className={th}>Field</th><th className={th}>Type</th><th className={th}>Required</th><th className={th}>Shown</th></tr></thead>
          <tbody>{q.data.map((d) => (
            <tr key={d.id} className="border-t"><td className={td}>{d.label} <span className="text-xs text-gray-400">{d.key}</span></td><td className={td}>{d.fieldType.toLowerCase()}</td>
              <td className={td}><input type="checkbox" aria-label={`${d.label} required`} checked={d.required} onChange={(e) => update.mutate({ id: d.id, body: { required: e.target.checked } })} /></td>
              <td className={td}><input type="checkbox" aria-label={`${d.label} shown`} checked={d.active} onChange={(e) => update.mutate({ id: d.id, body: { active: e.target.checked } })} /></td></tr>))}</tbody></table></div>
      )}
    </section>
  );
};

export const GuardianLinks = () => {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['profile-admin', 'guardians'], queryFn: async () => (await apiClient.get<{ guardians: Guardian[] }>(`${A}/guardians`)).data.guardians });
  const [f, setF] = useState({ guardianMemberId: '', minorMemberId: '', relationship: 'PARENT' });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['profile-admin', 'guardians'] });
  const link = useMutation({ mutationFn: () => apiClient.post(`${A}/guardians`, f), onSuccess: () => { setF({ ...f, guardianMemberId: '', minorMemberId: '' }); refresh(); } });
  const revoke = useMutation({ mutationFn: (id: string) => apiClient.delete(`${A}/guardians/${id}`), onSuccess: refresh });
  return (
    <section className={card} aria-label="Guardians">
      <h2 className="mb-1 text-lg font-semibold text-gray-900">Guardians of children</h2>
      <p className="mb-3 text-sm text-gray-600">A linked adult can update a child's details and photo and ask for reviewed changes. The link ends by itself when the child turns 18. Both people need a recorded date of birth.</p>
      {(link.error || revoke.error) && <ApiError error={link.error ?? revoke.error} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label="Guardian member ID" value={f.guardianMemberId} onChange={(e) => setF({ ...f, guardianMemberId: e.target.value.trim() })} />
        <FormField label="Child member ID" value={f.minorMemberId} onChange={(e) => setF({ ...f, minorMemberId: e.target.value.trim() })} />
        <label className="block text-sm font-medium text-gray-700">Relationship
          <select className="mt-1 block w-full rounded-lg border-gray-300" value={f.relationship} onChange={(e) => setF({ ...f, relationship: e.target.value })}><option value="PARENT">Parent</option><option value="LEGAL_GUARDIAN">Legal guardian</option><option value="OTHER">Other</option></select>
        </label>
      </div>
      <button type="button" className={`${primaryBtn} mt-3`} disabled={link.isPending || !f.guardianMemberId || !f.minorMemberId} onClick={() => link.mutate()}>Link guardian</button>
      {q.data?.length ? (
        <ul className="mt-4 space-y-1 text-sm">{q.data.map((g) => <li key={g.id}>{g.guardianMemberId} cares for {g.minorMemberId} ({g.relationship.toLowerCase().replace('_', ' ')}) <button type="button" className={`${secondaryBtn} ml-2`} onClick={() => revoke.mutate(g.id)}>End link</button></li>)}</ul>
      ) : null}
    </section>
  );
};
