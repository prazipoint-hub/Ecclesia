import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { Modal } from '@/components/forms/Modal';
import { EmptyBlock, ErrorBlock, LoadingBlock, card, formatDate, primaryBtn, secondaryBtn, titleCase } from '@/pages/account/shared';
import { AdminHeader, NoAccess } from '@/pages/admin/adminShared';
import { ErrorNotice, SuccessNotice } from '@/pages/auth/AuthShell';
import { useAuthStore } from '@stores/authStore';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import { can } from '@/types/notifications';
import { KNOWN_PLACEHOLDERS, fieldPlaceholders } from '@/types/advanced';
import type { DocumentTemplate, DocumentType, IssuedDocument, IssuedDocumentList } from '@/types/advanced';
import { Labeled, inputCls } from './shared';

const TYPES: DocumentType[] = ['CERTIFICATE', 'LETTER', 'MINUTES'];

export const GenerateForm = ({ templates }: { templates: DocumentTemplate[] }) => {
  const queryClient = useQueryClient();
  const active = templates.filter((t) => t.isActive);
  const [templateId, setTemplateId] = useState('');
  const [memberId, setMemberId] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<string | null>(null);
  const template = active.find((t) => t.id === templateId);
  const names = template ? fieldPlaceholders(template.title, template.body) : [];
  const generate = useMutation({
    mutationFn: async () => (await apiClient.post<IssuedDocument>('/api/v2/documents/generate', {
      templateId, ...(memberId.trim() ? { memberId: memberId.trim() } : {}), fields: Object.fromEntries(names.map((n) => [n, fields[n] ?? ''])),
    })).data,
    onSuccess: (doc) => { setCreated(doc.serial); setFields({}); queryClient.invalidateQueries({ queryKey: ['documents'] }); },
  });
  return (
    <form className={`${card} space-y-3`} aria-label="Generate document" onSubmit={(e) => { e.preventDefault(); setCreated(null); if (template) generate.mutate(); }}>
      <Labeled label="Template">
        <select className={inputCls} value={templateId} onChange={(e) => { setTemplateId(e.target.value); setFields({}); setCreated(null); }}>
          <option value="">Choose a template…</option>{active.map((t) => <option key={t.id} value={t.id}>{t.name} ({titleCase(t.type)})</option>)}
        </select>
      </Labeled>
      <Labeled label="Member ID (needed if the template names a member)"><input className={inputCls} value={memberId} onChange={(e) => setMemberId(e.target.value)} /></Labeled>
      {names.map((n) => (
        <Labeled key={n} label={`Field: ${n}`}><input className={inputCls} value={fields[n] ?? ''} onChange={(e) => setFields({ ...fields, [n]: e.target.value })} /></Labeled>
      ))}
      {generate.error != null && <ErrorNotice message={getApiErrorMessage(generate.error)} />}
      {created && <SuccessNotice message={`Document ${created} issued.`} />}
      <button type="submit" className={primaryBtn} disabled={!template || generate.isPending}>Generate</button>
    </form>
  );
};

export const VoidModal = ({ doc, onClose }: { doc: IssuedDocument | null; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const voidDoc = useMutation({
    mutationFn: async () => apiClient.post(`/api/v2/documents/${doc!.id}/void`, { reason: reason.trim() }),
    onSuccess: () => { setReason(''); queryClient.invalidateQueries({ queryKey: ['documents'] }); onClose(); },
  });
  const submit = () => {
    if (reason.trim().length < 5) return setError('Give a reason of at least 5 characters.');
    setError('');
    voidDoc.mutate();
  };
  return (
    <Modal open={doc !== null} title={`Void ${doc?.serial ?? ''}`} onClose={onClose}
      footer={<><button type="button" className={secondaryBtn} onClick={onClose}>Cancel</button><button type="button" className={primaryBtn} disabled={voidDoc.isPending} onClick={submit}>Void document</button></>}>
      <p className="mb-2 text-sm text-gray-700">A voided document stays on record and its PDF is stamped VOID.</p>
      <Labeled label="Reason for voiding"><textarea className={inputCls} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Labeled>
      {(error || voidDoc.error != null) && <div className="mt-2"><ErrorNotice message={error || getApiErrorMessage(voidDoc.error)} /></div>}
    </Modal>
  );
};

const TemplateEditor = ({ template, onDone }: { template: DocumentTemplate | null; onDone: () => void }) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ type: template?.type ?? ('CERTIFICATE' as DocumentType), name: template?.name ?? '', title: template?.title ?? '', body: template?.body ?? '', isActive: template?.isActive ?? true });
  const save = useMutation({
    mutationFn: async () => template
      ? apiClient.put(`/api/v2/documents/templates/${template.id}`, { name: form.name.trim(), title: form.title.trim(), body: form.body.trim(), isActive: form.isActive })
      : apiClient.post('/api/v2/documents/templates', { type: form.type, name: form.name.trim(), title: form.title.trim(), body: form.body.trim() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['documents', 'templates'] }); onDone(); },
  });
  return (
    <form className={`${card} space-y-3`} aria-label="Template editor" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <p className="text-xs text-gray-500">Allowed placeholders: {KNOWN_PLACEHOLDERS.map((p) => `{{${p}}}`).join(', ')} and {'{{field.<name>}}'} for values typed in when generating.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="Name"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Labeled>
        <Labeled label="Type"><select className={inputCls} disabled={Boolean(template)} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as DocumentType })}>{TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</select></Labeled>
      </div>
      <Labeled label="Title"><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Labeled>
      <Labeled label="Body"><textarea className={inputCls} rows={8} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Labeled>
      {template && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active</label>}
      {save.error != null && <ErrorNotice message={getApiErrorMessage(save.error)} />}
      <div className="flex gap-2"><button type="submit" className={primaryBtn} disabled={save.isPending}>Save template</button><button type="button" className={secondaryBtn} onClick={onDone}>Cancel</button></div>
    </form>
  );
};

const download = async (doc: IssuedDocument) => {
  const res = await apiClient.get<Blob>(`/api/v2/documents/${doc.id}/pdf`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${doc.serial}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
};

export const DocumentsPage = () => {
  const permissions = useAuthStore((s) => s.user?.permissions);
  const allowed = can(permissions, 'document:view');
  const canGenerate = can(permissions, 'document:generate');
  const canTemplates = can(permissions, 'document:template:manage');
  const [tab, setTab] = useState<'issued' | 'generate' | 'templates'>('issued');
  const [voiding, setVoiding] = useState<IssuedDocument | null>(null);
  const [editing, setEditing] = useState<DocumentTemplate | 'new' | null>(null);
  const [downloadError, setDownloadError] = useState<unknown>(null);
  const issued = useQuery({ queryKey: ['documents', 'issued'], enabled: allowed, queryFn: async () => (await apiClient.get<IssuedDocumentList>('/api/v2/documents', { params: { take: 100 } })).data });
  const templates = useQuery({ queryKey: ['documents', 'templates'], enabled: allowed, queryFn: async () => (await apiClient.get<DocumentTemplate[]>('/api/v2/documents/templates')).data });
  const tabs = [['issued', 'Issued'], ...(canGenerate ? [['generate', 'Generate']] : []), ...(canTemplates ? [['templates', 'Templates']] : [])] as Array<[typeof tab, string]>;
  return (
    <MainLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <AdminHeader title="Documents" subtitle="Certificates, letters and minutes issued from templates." />
        {!allowed && <NoAccess permission="document:view" />}
        {allowed && (
          <div role="tablist" className="flex gap-2">
            {tabs.map(([key, label]) => <button key={key} role="tab" type="button" aria-selected={tab === key} className={tab === key ? primaryBtn : secondaryBtn} onClick={() => setTab(key)}>{label}</button>)}
          </div>
        )}
        {allowed && tab === 'issued' && (
          <>
            {issued.isLoading && <LoadingBlock />}
            {issued.isError && <ErrorBlock error={issued.error} onRetry={() => issued.refetch()} />}
            {downloadError != null && <ErrorNotice message={getApiErrorMessage(downloadError)} />}
            {issued.data && issued.data.items.length === 0 && <EmptyBlock message="Nothing issued yet." />}
            {issued.data && issued.data.items.length > 0 && (
              <ul className="space-y-2">
                {issued.data.items.map((d) => (
                  <li key={d.id} className={`${card} flex flex-wrap items-center justify-between gap-2 !p-4`}>
                    <div><p className="font-medium text-gray-900">{d.title}</p><p className="text-xs text-gray-500">{d.serial} · {titleCase(d.type)} · {formatDate(d.createdAt)}{d.voidedAt ? ' · VOID' : ''}</p></div>
                    <div className="flex gap-2">
                      <button type="button" className={secondaryBtn} onClick={() => download(d).then(() => setDownloadError(null)).catch(setDownloadError)}>Download PDF</button>
                      {canGenerate && !d.voidedAt && <button type="button" className={secondaryBtn} onClick={() => setVoiding(d)}>Void</button>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {allowed && tab === 'generate' && canGenerate && (templates.data ? <GenerateForm templates={templates.data} /> : <LoadingBlock />)}
        {allowed && tab === 'templates' && canTemplates && (
          <>
            {editing ? <TemplateEditor key={editing === 'new' ? 'new' : editing.id} template={editing === 'new' ? null : editing} onDone={() => setEditing(null)} /> : (
              <>
                <button type="button" className={primaryBtn} onClick={() => setEditing('new')}>New template</button>
                {templates.data?.length === 0 && <EmptyBlock message="No templates yet." />}
                <ul className="space-y-2">{templates.data?.map((t) => (
                  <li key={t.id} className={`${card} flex items-center justify-between !p-4`}><span>{t.name} <span className="text-xs text-gray-500">({titleCase(t.type)}){t.isActive ? '' : ' · inactive'}</span></span><button type="button" className={secondaryBtn} onClick={() => setEditing(t)}>Edit</button></li>
                ))}</ul>
              </>
            )}
          </>
        )}
      </div>
      <VoidModal doc={voiding} onClose={() => setVoiding(null)} />
    </MainLayout>
  );
};
export default DocumentsPage;
