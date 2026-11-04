import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { HeartHandshake, Plus, RefreshCw, X } from 'lucide-react';
import { MainLayout } from '@/components/Layout/MainLayout';
import { useAuthStore } from '@/stores/authStore';
import { apiClient } from '@/utils/api';

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

const label = (value: string) => value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter: string) => letter.toUpperCase());

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
  const [form, setForm] = useState({ memberId: '', category: 'SPIRITUAL' as CaseCategory, priority: 'NORMAL' as CasePriority, concern: '', targetFollowUpAt: '' });

  const canCreate = Boolean(user?.permissions.includes('pastoral:case:create'));
  const hasViewPermission = Boolean(user?.permissions.includes('pastoral:case:view'));
  const activeCases = useMemo(() => cases.filter((pastoralCase) => pastoralCase.status !== 'CLOSED').length, [cases]);

  const loadCases = useCallback(async () => {
    if (!hasViewPermission) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<PastoralCasesResponse>('/api/v2/pastoral/cases', { params: { take: 50 } });
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
      const { data } = await apiClient.get<{ members: Member[] }>('/api/v2/members', { params: { churchId: user.churchId, take: 100 } });
      setMembers(data.members);
    } catch (loadError) {
      setError(messageFrom(loadError, 'Members could not be loaded for a new pastoral case.'));
    }
  }, [canCreate, user?.churchId]);

  useEffect(() => { void loadCases(); }, [loadCases]);
  useEffect(() => { void loadMembers(); }, [loadMembers]);

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
        ...(form.targetFollowUpAt ? { targetFollowUpAt: new Date(form.targetFollowUpAt).toISOString() } : {}),
      });
      setForm({ memberId: '', category: 'SPIRITUAL', priority: 'NORMAL', concern: '', targetFollowUpAt: '' });
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
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary-600">Care ministry</p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">Pastoral care</h1>
            <p className="mt-2 max-w-2xl text-gray-600">A confidential queue for follow-up, support, and accountable care.</p>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => void loadCases()} disabled={isLoading || !hasViewPermission} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            {canCreate && <button type="button" onClick={() => setIsCreateOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"><Plus className="h-4 w-4" /> Open case</button>}
          </div>
        </div>

        {!hasViewPermission ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">Your role does not include access to pastoral cases. Ask a church administrator to assign the required pastoral-care permission.</div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800"><p>{error}</p><button type="button" onClick={() => void loadCases()} className="mt-3 font-semibold underline">Try again</button></div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><p className="text-sm font-medium text-gray-500">Open or active</p><p className="mt-2 text-3xl font-bold text-gray-900">{activeCases}</p></div>
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><p className="text-sm font-medium text-gray-500">Urgent</p><p className="mt-2 text-3xl font-bold text-red-700">{cases.filter((pastoralCase) => pastoralCase.priority === 'URGENT' && pastoralCase.status !== 'CLOSED').length}</p></div>
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><p className="text-sm font-medium text-gray-500">Recorded cases</p><p className="mt-2 text-3xl font-bold text-gray-900">{total}</p></div>
            </div>
            <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-4"><span className="rounded-lg bg-primary-50 p-2 text-primary-700"><HeartHandshake className="h-5 w-5" /></span><div><h2 className="font-semibold text-gray-900">Care queue</h2><p className="text-sm text-gray-500">Only authorised pastoral workers can access these records.</p></div></div>
              {isLoading ? <div className="p-10 text-center text-gray-500">Loading pastoral cases…</div> : cases.length === 0 ? <div className="p-10 text-center text-gray-500">No pastoral cases have been opened for this church.</div> : <div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200 text-left"><thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-5 py-3">Member</th><th className="px-5 py-3">Care area</th><th className="px-5 py-3">Priority</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Follow-up</th></tr></thead><tbody className="divide-y divide-gray-100">{cases.map((pastoralCase) => <tr key={pastoralCase.id}><td className="px-5 py-4"><p className="font-semibold text-gray-900">{pastoralCase.memberName ?? 'Member record'}</p><p className="mt-1 max-w-sm truncate text-sm text-gray-500">{pastoralCase.concern}</p></td><td className="px-5 py-4 text-sm text-gray-600">{label(pastoralCase.category)}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${priorityStyle[pastoralCase.priority]}`}>{label(pastoralCase.priority)}</span></td><td className="px-5 py-4 text-sm font-medium text-gray-700">{label(pastoralCase.status)}</td><td className="px-5 py-4 text-sm text-gray-600">{pastoralCase.targetFollowUpAt ? new Date(pastoralCase.targetFollowUpAt).toLocaleDateString() : 'Not scheduled'}</td></tr>)}</tbody></table></div>}
            </section>
          </>
        )}
      </div>

      {isCreateOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-xl rounded-xl bg-white shadow-xl"><div className="flex items-center justify-between border-b border-gray-200 px-6 py-4"><div><h2 className="text-lg font-semibold text-gray-900">Open pastoral case</h2><p className="mt-1 text-sm text-gray-500">Keep the record factual and concise.</p></div><button type="button" onClick={() => setIsCreateOpen(false)} aria-label="Close" className="rounded-lg p-2 hover:bg-gray-100"><X className="h-5 w-5" /></button></div><form onSubmit={createCase} className="space-y-4 p-6"><label className="block text-sm font-medium text-gray-700">Member<select required value={form.memberId} onChange={(event) => setForm({ ...form, memberId: event.target.value })} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5"><option value="">Select a member</option>{members.map((member) => <option key={member.id} value={member.id}>{member.firstName} {member.lastName} · {member.membershipNumber}</option>)}</select></label><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-gray-700">Care area<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as CaseCategory })} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5">{categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label><label className="text-sm font-medium text-gray-700">Priority<select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as CasePriority })} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5">{(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as CasePriority[]).map((priority) => <option key={priority} value={priority}>{label(priority)}</option>)}</select></label></div><label className="block text-sm font-medium text-gray-700">Concern<textarea required minLength={10} value={form.concern} onChange={(event) => setForm({ ...form, concern: event.target.value })} rows={4} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5" placeholder="Record the concern without unnecessary sensitive detail." /></label><label className="block text-sm font-medium text-gray-700">Target follow-up date <span className="font-normal text-gray-500">(optional)</span><input type="datetime-local" value={form.targetFollowUpAt} onChange={(event) => setForm({ ...form, targetFollowUpAt: event.target.value })} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label><div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => setIsCreateOpen(false)} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100">Cancel</button><button type="submit" disabled={isSaving || !form.memberId} className="rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60">{isSaving ? 'Opening…' : 'Open case'}</button></div></form></div></div>}
    </MainLayout>
  );
};
