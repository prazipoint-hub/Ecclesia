import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { FormTextarea } from '@/components/forms/FormTextarea';
import { Modal } from '@/components/forms/Modal';
import { EmptyBlock, ErrorBlock, LoadingBlock, card, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { useAuthStore } from '@stores/authStore';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import { can, type CommunicationTemplate, type TemplateList } from '@/types/notifications';
import { AdminHeader, NoAccess } from './adminShared';

const PERMISSION = 'notification:template:manage';
export const TEMPLATES_KEY = ['notifications', 'templates'] as const;

type Draft = { name: string; subject: string; body: string };
const EMPTY: Draft = { name: '', subject: '', body: '' };

const TemplateForm = ({ initial, variables, saving, error, onSubmit, onCancel }: {
  initial: Draft;
  variables: string[];
  saving: boolean;
  error: unknown;
  onSubmit: (draft: Draft) => void;
  onCancel: () => void;
}) => {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  // FormTextarea does not forward refs, so reach the textarea through its wrapper.
  const bodyWrap = useRef<HTMLDivElement>(null);

  const insert = (variable: string) => {
    const token = `{{${variable}}}`;
    const el = bodyWrap.current?.querySelector('textarea') ?? null;
    const start = el?.selectionStart ?? draft.body.length;
    const end = el?.selectionEnd ?? draft.body.length;
    setDraft((prev) => ({ ...prev, body: prev.body.slice(0, start) + token + prev.body.slice(end) }));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: typeof errors = {};
    if (!draft.name.trim()) next.name = 'Enter a name.';
    if (!draft.subject.trim()) next.subject = 'Enter a subject.';
    if (!draft.body.trim()) next.body = 'Enter the message text.';
    setErrors(next);
    if (Object.keys(next).length === 0) onSubmit({ name: draft.name.trim(), subject: draft.subject.trim(), body: draft.body.trim() });
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <FormField label="Name" value={draft.name} error={errors.name} maxLength={100} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      <FormField label="Subject" value={draft.subject} error={errors.subject} maxLength={150} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
      <div ref={bodyWrap}>
        <FormTextarea label="Message" value={draft.body} error={errors.body} maxLength={5000} rows={6} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
        <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label="Insert placeholder">
          <span className="text-xs text-gray-500">Insert:</span>
          {variables.map((variable) => (
            <button key={variable} type="button" onClick={() => insert(variable)} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200">
              {variable}
            </button>
          ))}
        </div>
      </div>
      {error != null && <ErrorNotice message={getApiErrorMessage(error)} />}
      <div className="flex justify-end gap-2">
        <button type="button" className={secondaryBtn} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={primaryBtn} disabled={saving}>
          {saving ? 'Saving…' : 'Save template'}
        </button>
      </div>
    </form>
  );
};

export const TemplatesPage = () => {
  const permissions = useAuthStore((state) => state.user?.permissions);
  const allowed = can(permissions, PERMISSION);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<CommunicationTemplate | 'new' | null>(null);
  const [deleting, setDeleting] = useState<CommunicationTemplate | null>(null);

  const templates = useQuery({
    queryKey: TEMPLATES_KEY,
    queryFn: async () => (await apiClient.get<TemplateList>('/api/v2/notifications/templates')).data,
    enabled: allowed,
  });

  const save = useMutation({
    mutationFn: async (draft: Draft) =>
      editing && editing !== 'new'
        ? (await apiClient.put(`/api/v2/notifications/templates/${editing.id}`, draft)).data
        : (await apiClient.post('/api/v2/notifications/templates', draft)).data,
    onSuccess: () => {
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/v2/notifications/templates/${id}`);
    },
    onSuccess: () => {
      setDeleting(null);
      queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
    },
  });

  return (
    <MainLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <AdminHeader
          title="Message templates"
          subtitle="Reusable wording for broadcasts. Placeholders are filled in for each member."
          action={
            allowed && (
              <button type="button" className={primaryBtn} onClick={() => { save.reset(); setEditing('new'); }}>
                New template
              </button>
            )
          }
        />
        {!allowed && <NoAccess permission={PERMISSION} />}
        {allowed && templates.isLoading && <LoadingBlock />}
        {templates.isError && <ErrorBlock error={templates.error} onRetry={() => templates.refetch()} />}
        {templates.data && templates.data.items.length === 0 && <EmptyBlock message="No templates yet." />}
        {templates.data && templates.data.items.length > 0 && (
          <ul className="space-y-3">
            {templates.data.items.map((template) => (
              <li key={template.id} className={card}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-gray-900">{template.name}</h2>
                    <p className="text-sm text-gray-600">{template.subject}</p>
                    <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-gray-500">{template.body}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className={secondaryBtn} onClick={() => { save.reset(); setEditing(template); }} aria-label={`Edit ${template.name}`}>
                      Edit
                    </button>
                    <button type="button" className={secondaryBtn} onClick={() => { remove.reset(); setDeleting(template); }} aria-label={`Delete ${template.name}`}>
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal open={editing !== null} title={editing === 'new' ? 'New template' : 'Edit template'} onClose={() => setEditing(null)}>
        {editing && (
          <TemplateForm
            initial={editing === 'new' ? EMPTY : { name: editing.name, subject: editing.subject, body: editing.body }}
            variables={templates.data?.variables ?? []}
            saving={save.isPending}
            error={save.error}
            onSubmit={(draft) => save.mutate(draft)}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>

      <Modal
        open={deleting !== null}
        title="Delete template"
        onClose={() => setDeleting(null)}
        footer={
          <>
            <button type="button" className={secondaryBtn} onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button type="button" className={primaryBtn} disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting.id)}>
              {remove.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-700">Delete “{deleting?.name}”? Broadcasts already written from it are not affected.</p>
        {remove.error != null && <div className="mt-3"><ErrorNotice message={getApiErrorMessage(remove.error)} /></div>}
      </Modal>
    </MainLayout>
  );
};

export default TemplatesPage;
