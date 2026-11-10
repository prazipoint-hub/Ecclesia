import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, HeartHandshake, Plus, RefreshCw } from 'lucide-react';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { FormSelect } from '@/components/forms/FormSelect';
import { FormTextarea } from '@/components/forms/FormTextarea';
import { Modal } from '@/components/forms/Modal';
import { EmptyBlock, LoadingBlock, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { useAuthStore } from '@/stores/authStore';
import { apiClient } from '@/utils/api';
import { PastoralNav } from '@/pages/pastoral/pastoralShared';

type CasePriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
type CaseCategory =
  | 'SPIRITUAL'
  | 'FAMILY'
  | 'MARRIAGE'
  | 'BEREAVEMENT'
  | 'EMOTIONAL'
  | 'FINANCIAL'
  | 'HEALTH_SUPPORT'
  | 'YOUTH'
  | 'CRISIS'
  | 'DISCIPLESHIP'
  | 'OTHER';

interface PastoralCase {
  id: string;
  memberId: string;
  memberName?: string;
  category: string;
  concern: string;
  priority: CasePriority;
  status: string;
  assignedPastorName?: string;
  openedAt: string;
  targetFollowUpAt?: string;
  activityCount: number;
}

interface PastoralCasesResponse {
  cases: PastoralCase[];
  total: number;
}

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  membershipNumber: string;
}

const categories: Array<{ value: CaseCategory; label: string }> = [
  { value: 'SPIRITUAL', label: 'Spiritual care' },
  { value: 'FAMILY', label: 'Family' },
  { value: 'MARRIAGE', label: 'Marriage' },
  { value: 'BEREAVEMENT', label: 'Bereavement' },
  { value: 'EMOTIONAL', label: 'Emotional support' },
  { value: 'FINANCIAL', label: 'Financial support' },
  { value: 'HEALTH_SUPPORT', label: 'Health support' },
  { value: 'YOUTH', label: 'Youth' },
  { value: 'CRISIS', label: 'Crisis' },
  { value: 'DISCIPLESHIP', label: 'Discipleship' },
  { value: 'OTHER', label: 'Other' },
];

const messageFrom = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error && 'response' in error) {
    const data = (error as { response?: { data?: { error?: string } } }).response?.data;
    if (data?.error) return data.error;
  }
  return fallback;
};

const label = (value: string) =>
  value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter: string) => letter.toUpperCase());

const priorityStyle: Record<CasePriority, string> = {
  LOW: 'bg-slate-100 text-slate-700',
  NORMAL: 'bg-sky-50 text-sky-700',
  HIGH: 'bg-amber-50 text-amber-800',
  URGENT: 'bg-red-50 text-red-800',
};

export const PastoralCasesPage = () => {
  const { user } = useAuthStore();
  const [cases, setCases] = useState<PastoralCase[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    memberId: '',
    category: 'SPIRITUAL' as CaseCategory,
    priority: 'NORMAL' as CasePriority,
    concern: '',
    targetFollowUpAt: '',
  });

  const canCreate = Boolean(user?.permissions.includes('pastoral:case:create'));
  const hasViewPermission = Boolean(user?.permissions.includes('pastoral:case:view'));
  const activeCases = useMemo(
    () => cases.filter((pastoralCase) => pastoralCase.status !== 'CLOSED').length,
    [cases]
  );

  const loadCases = useCallback(async () => {
    if (!hasViewPermission) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<PastoralCasesResponse>('/api/v2/pastoral/cases', {
        params: { take: 50 },
      });
      setCases(data.cases);
      setTotal(data.total);
    } catch (loadError) {
      setError(messageFrom(loadError, 'Pastoral cases could not be loaded.'));
    } finally {
      setIsLoading(false);
    }
  }, [hasViewPermission]);

  const loadMembers = useCallback(async () => {
    if (!user?.churchId || !canCreate) return;
    try {
      const { data } = await apiClient.get<{ members: Member[] }>('/api/v2/members', {
        params: { churchId: user.churchId, take: 100 },
      });
      setMembers(data.members);
    } catch (loadError) {
      setError(messageFrom(loadError, 'Members could not be loaded for a new pastoral case.'));
    }
  }, [canCreate, user?.churchId]);

  useEffect(() => {
    void loadCases();
  }, [loadCases]);
  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const createCase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await apiClient.post('/api/v2/pastoral/cases', {
        memberId: form.memberId,
        category: form.category,
        priority: form.priority,
        concern: form.concern.trim(),
        ...(form.targetFollowUpAt
          ? { targetFollowUpAt: new Date(form.targetFollowUpAt).toISOString() }
          : {}),
      });
      setForm({
        memberId: '',
        category: 'SPIRITUAL',
        priority: 'NORMAL',
        concern: '',
        targetFollowUpAt: '',
      });
      setIsCreateOpen(false);
      await loadCases();
    } catch (createError) {
      setError(messageFrom(createError, 'The pastoral case could not be opened.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-7xl space-y-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="page-eyebrow">Care ministry</p>
            <h1 className="mt-2 text-2xl font-medium text-gray-950 sm:text-2xl">Pastoral care</h1>
            <p className="mt-2 max-w-2xl text-gray-600">
              A confidential queue for follow-up, support, and accountable care.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void loadCases()}
              disabled={isLoading || !hasViewPermission}
              className={secondaryBtn}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            {canCreate && (
              <button type="button" onClick={() => setIsCreateOpen(true)} className={primaryBtn}>
                <Plus className="h-4 w-4" /> Open case
              </button>
            )}
          </div>
        </div>

        <PastoralNav />
        {!hasViewPermission ? (
          <div
            role="alert"
            className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-900 shadow-sm"
          >
            Your role does not include access to pastoral cases. Ask a church administrator to
            assign the required pastoral-care permission.
          </div>
        ) : error ? (
          <div className="space-y-3">
            <ErrorNotice message={error} />
            <button type="button" onClick={() => void loadCases()} className={secondaryBtn}>
              Try again
            </button>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-gray-200/80 bg-white p-5 shadow-card">
                <p className="text-sm font-medium text-gray-500">Open or active</p>
                <p className="mt-2 text-2xl font-medium text-gray-900">{activeCases}</p>
              </div>
              <div className="rounded-lg border border-red-200/80 bg-white p-5 shadow-card">
                <p className="text-sm font-medium text-gray-500">Urgent</p>
                <p className="mt-2 flex items-center gap-2 text-2xl font-medium text-red-700">
                  <AlertTriangle className="h-6 w-6" />
                  {
                    cases.filter(
                      (pastoralCase) =>
                        pastoralCase.priority === 'URGENT' && pastoralCase.status !== 'CLOSED'
                    ).length
                  }
                </p>
              </div>
              <div className="rounded-lg border border-gray-200/80 bg-white p-5 shadow-card">
                <p className="text-sm font-medium text-gray-500">Recorded cases</p>
                <p className="mt-2 text-2xl font-medium text-gray-900">{total}</p>
              </div>
            </div>
            <section className="overflow-hidden rounded-lg border border-gray-200/80 bg-white shadow-card">
              <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4 sm:px-6">
                <span className="rounded-md bg-primary-50 p-2.5 text-primary-700">
                  <HeartHandshake className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-medium text-gray-900">Care queue</h2>
                  <p className="text-sm text-gray-500">
                    Only authorised pastoral workers can access these records.
                  </p>
                </div>
              </div>
              {isLoading ? (
                <div className="p-5">
                  <LoadingBlock label="Loading pastoral cases…" />
                </div>
              ) : cases.length === 0 ? (
                <div className="p-5">
                  <EmptyBlock message="No pastoral cases have been opened for this church." />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-left">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-5 py-3">Member</th>
                        <th className="px-5 py-3">Care area</th>
                        <th className="px-5 py-3">Priority</th>
                        <th className="px-5 py-3">Status</th>
                        <th className="px-5 py-3">Follow-up</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {cases.map((pastoralCase) => (
                        <tr key={pastoralCase.id}>
                          <td className="px-5 py-4">
                            <p className="font-medium text-gray-900">
                              {pastoralCase.memberName ?? 'Member record'}
                            </p>
                            <p className="mt-1 max-w-sm truncate text-sm text-gray-500">
                              {pastoralCase.concern}
                            </p>
                          </td>
                          <td className="px-5 py-4 text-sm text-gray-600">
                            {label(pastoralCase.category)}
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-medium ${priorityStyle[pastoralCase.priority]}`}
                            >
                              {label(pastoralCase.priority)}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-sm font-medium text-gray-700">
                            {label(pastoralCase.status)}
                          </td>
                          <td className="px-5 py-4 text-sm text-gray-600">
                            {pastoralCase.targetFollowUpAt
                              ? new Date(pastoralCase.targetFollowUpAt).toLocaleDateString()
                              : 'Not scheduled'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <Modal
        open={isCreateOpen}
        title="Open pastoral case"
        onClose={() => setIsCreateOpen(false)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className={secondaryBtn}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="open-pastoral-case-form"
              disabled={isSaving || !form.memberId}
              className={primaryBtn}
            >
              {isSaving ? 'Opening…' : 'Open case'}
            </button>
          </>
        }
      >
        <form id="open-pastoral-case-form" onSubmit={createCase} className="space-y-4">
          <p className="rounded-md border border-primary-100 bg-primary-50 p-3 text-sm text-primary-900">
            Keep the record factual, concise, and limited to information needed for care.
          </p>
          <FormSelect
            label="Member"
            required
            value={form.memberId}
            placeholder="Select a member"
            options={members.map((member) => ({
              value: member.id,
              label: `${member.firstName} ${member.lastName} · ${member.membershipNumber}`,
            }))}
            onChange={(event) => setForm({ ...form, memberId: event.target.value })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormSelect
              label="Care area"
              value={form.category}
              options={categories}
              onChange={(event) =>
                setForm({ ...form, category: event.target.value as CaseCategory })
              }
            />
            <FormSelect
              label="Priority"
              value={form.priority}
              options={(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as CasePriority[]).map((priority) => ({
                value: priority,
                label: label(priority),
              }))}
              onChange={(event) =>
                setForm({ ...form, priority: event.target.value as CasePriority })
              }
            />
          </div>
          <FormTextarea
            label="Concern"
            required
            minLength={10}
            value={form.concern}
            onChange={(event) => setForm({ ...form, concern: event.target.value })}
            rows={4}
            placeholder="Record the concern without unnecessary sensitive detail."
          />
          <FormField
            label="Target follow-up date (optional)"
            type="datetime-local"
            value={form.targetFollowUpAt}
            onChange={(event) => setForm({ ...form, targetFollowUpAt: event.target.value })}
          />
        </form>
      </Modal>
    </MainLayout>
  );
};
