import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Layers3, Pencil, Plus, RefreshCw, UsersRound } from 'lucide-react';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { FormTextarea } from '@/components/forms/FormTextarea';
import { Modal } from '@/components/forms/Modal';
import { EmptyBlock, LoadingBlock, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { Header } from '@/pages/members/peopleShared';
import { useAuthStore } from '@/stores/authStore';
import { apiClient } from '@/utils/api';

interface Committee {
  id: string;
  name: string;
  description?: string | null;
  _count: { members: number };
}

const errorMessage = (error: unknown, fallback: string) =>
  typeof error === 'object' && error && 'response' in error
    ? (error as { response?: { data?: { error?: string } } }).response?.data?.error ?? fallback
    : fallback;

export const CommitteesPage = () => {
  const { user } = useAuthStore();
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Committee | null>(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const canView = Boolean(user?.permissions.includes('committee:view'));
  const canCreate = Boolean(user?.permissions.includes('committee:create'));
  const canUpdate = Boolean(user?.permissions.includes('committee:update'));

  const load = useCallback(async () => {
    if (!canView) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<Committee[]>('/api/v2/committees');
      setCommittees(data);
    } catch (requestError) {
      setError(errorMessage(requestError, 'Committees could not be loaded.'));
    } finally {
      setIsLoading(false);
    }
  }, [canView]);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', description: '' });
    setIsFormOpen(true);
  };
  const openEdit = (committee: Committee) => {
    setEditing(committee);
    setForm({ name: committee.name, description: committee.description ?? '' });
    setIsFormOpen(true);
  };
  const closeForm = () => {
    if (!isSaving) setIsFormOpen(false);
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const payload = { name: form.name.trim(), ...(form.description.trim() ? { description: form.description.trim() } : {}) };
      if (editing) await apiClient.put(`/api/v2/committees/${editing.id}`, payload);
      else await apiClient.post('/api/v2/committees', payload);
      setIsFormOpen(false);
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError, 'The committee could not be saved.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-6xl space-y-7">
        <Header
          title="Committees"
          subtitle="Maintain the church’s active governance and ministry committees."
          back={<p className="page-eyebrow">Governance</p>}
          action={(
            <>
              <button type="button" onClick={() => void load()} disabled={isLoading || !canView} className={secondaryBtn}>
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
              </button>
              {canCreate && <button type="button" onClick={openCreate} className={primaryBtn}><Plus className="h-4 w-4" /> New committee</button>}
            </>
          )}
        />

        {!canView ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-900 shadow-sm">Your role does not include committee access.</div>
        ) : error ? (
          <ErrorNotice message={error} />
        ) : isLoading ? (
          <LoadingBlock label="Loading committees…" />
        ) : committees.length === 0 ? (
          <EmptyBlock message="No committees have been created yet." />
        ) : (
          <section aria-labelledby="committee-register-heading" className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="rounded-md bg-primary-50 p-2.5 text-primary-700"><Layers3 className="h-5 w-5" /></span>
              <div><h2 id="committee-register-heading" className="font-medium text-gray-950">Committee register</h2><p className="text-sm text-gray-500">{committees.length} active record{committees.length === 1 ? '' : 's'}</p></div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {committees.map((committee) => (
                <article key={committee.id} className="group flex flex-col rounded-lg border border-gray-200/80 bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-lg">
                  <div className="flex items-start justify-between gap-3">
                    <span className="rounded-md bg-primary-50 p-2.5 text-primary-700"><UsersRound className="h-5 w-5" /></span>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">{committee._count.members} assignment{committee._count.members === 1 ? '' : 's'}</span>
                  </div>
                  <h3 className="mt-4 text-lg font-medium text-gray-950">{committee.name}</h3>
                  <p className="mt-1 min-h-10 text-sm leading-relaxed text-gray-500">{committee.description ?? 'No description recorded.'}</p>
                  <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
                    <Link to={`/committees/${committee.id}/meetings`} className={`${secondaryBtn} group/link`}>
                      Meetings <ArrowRight className="h-4 w-4 transition-transform group-hover/link:translate-x-0.5" />
                    </Link>
                    {canUpdate && <button type="button" onClick={() => openEdit(committee)} className={secondaryBtn}><Pencil className="h-4 w-4" /> Edit</button>}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>

      <Modal
        open={isFormOpen}
        title={editing ? 'Edit committee' : 'New committee'}
        onClose={closeForm}
        footer={(
          <>
            <button type="button" onClick={closeForm} className={secondaryBtn} disabled={isSaving}>Cancel</button>
            <button type="submit" form="committee-form" disabled={isSaving} className={primaryBtn}>{isSaving ? 'Saving…' : 'Save committee'}</button>
          </>
        )}
      >
        <form id="committee-form" onSubmit={save} className="space-y-4">
          <FormField label="Name" required minLength={3} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} disabled={isSaving} />
          <FormTextarea label="Description (optional)" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={4} disabled={isSaving} />
        </form>
      </Modal>
    </MainLayout>
  );
};
