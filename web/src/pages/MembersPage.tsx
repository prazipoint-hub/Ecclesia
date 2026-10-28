import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw, Users, X } from 'lucide-react';
import { MainLayout } from '@/components/Layout/MainLayout';
import { useAuthStore } from '@/stores/authStore';
import { apiClient } from '@/utils/api';

type Gender = 'MALE' | 'FEMALE' | 'OTHER';

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  membershipNumber: string;
  membershipStatus: string;
  phone: string | null;
  email: string | null;
}

interface MemberListResponse {
  members: Member[];
  total: number;
}

const messageFrom = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error && 'response' in error) {
    const data = (error as { response?: { data?: { error?: string } } }).response?.data;
    if (data?.error) return data.error;
  }
  return fallback;
};

export const MembersPage = () => {
  const { user } = useAuthStore();
  const [members, setMembers] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    gender: 'MALE' as Gender,
    email: '',
    phone: '',
  });

  const loadMembers = useCallback(async () => {
    if (!user?.churchId) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<MemberListResponse>('/api/v2/members', {
        params: { churchId: user.churchId, take: 50 },
      });
      setMembers(data.members);
      setTotal(data.total);
    } catch (loadError) {
      setError(messageFrom(loadError, 'Members could not be loaded.'));
    } finally {
      setIsLoading(false);
    }
  }, [user?.churchId]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const createMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user?.churchId) return;
    setIsSaving(true);
    setError(null);
    try {
      await apiClient.post('/api/v2/members', {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        gender: form.gender,
        churchId: user.churchId,
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      });
      setForm({ firstName: '', lastName: '', gender: 'MALE', email: '', phone: '' });
      setIsCreateOpen(false);
      await loadMembers();
    } catch (createError) {
      setError(messageFrom(createError, 'The member could not be created.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary-600">
              People
            </p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">Members</h1>
            <p className="mt-2 text-gray-600">
              Searchable church records and registration in one place.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void loadMembers()}
              disabled={isLoading || !user?.churchId}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              disabled={!user?.churchId}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus className="h-4 w-4" /> Add member
            </button>
          </div>
        </div>

        {!user?.churchId ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
            Your account is not assigned to a church yet. A church workspace is required before
            member records can be viewed or created.
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void loadMembers()}
              className="mt-3 font-semibold underline"
            >
              Try again
            </button>
          </div>
        ) : (
          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="rounded-lg bg-primary-50 p-2 text-primary-700">
                  <Users className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-semibold text-gray-900">Church directory</h2>
                  <p className="text-sm text-gray-500">
                    {total} member{total === 1 ? '' : 's'}
                  </p>
                </div>
              </div>
            </div>
            {isLoading ? (
              <div className="p-10 text-center text-gray-500">Loading members…</div>
            ) : members.length === 0 ? (
              <div className="p-10 text-center text-gray-500">
                No members have been registered in this church yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-left">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-5 py-3">Member</th>
                      <th className="px-5 py-3">Membership no.</th>
                      <th className="px-5 py-3">Contact</th>
                      <th className="px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {members.map((member) => (
                      <tr key={member.id}>
                        <td className="px-5 py-4">
                          <p className="font-semibold text-gray-900">
                            {member.firstName} {member.lastName}
                          </p>
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-600">
                          {member.membershipNumber}
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-600">
                          {member.email ?? member.phone ?? '—'}
                        </td>
                        <td className="px-5 py-4">
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                            {member.membershipStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Register member</h2>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                aria-label="Close"
                className="rounded-lg p-2 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={createMember} className="space-y-4 p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-gray-700">
                  First name
                  <input
                    required
                    value={form.firstName}
                    onChange={(event) => setForm({ ...form, firstName: event.target.value })}
                    className="mt-1 block w-full rounded-lg border-gray-300"
                  />
                </label>
                <label className="text-sm font-medium text-gray-700">
                  Last name
                  <input
                    required
                    value={form.lastName}
                    onChange={(event) => setForm({ ...form, lastName: event.target.value })}
                    className="mt-1 block w-full rounded-lg border-gray-300"
                  />
                </label>
              </div>
              <label className="block text-sm font-medium text-gray-700">
                Gender
                <select
                  value={form.gender}
                  onChange={(event) => setForm({ ...form, gender: event.target.value as Gender })}
                  className="mt-1 block w-full rounded-lg border-gray-300"
                >
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-gray-700">
                  Email
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                    className="mt-1 block w-full rounded-lg border-gray-300"
                  />
                </label>
                <label className="text-sm font-medium text-gray-700">
                  Phone
                  <input
                    value={form.phone}
                    onChange={(event) => setForm({ ...form, phone: event.target.value })}
                    className="mt-1 block w-full rounded-lg border-gray-300"
                  />
                </label>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-lg bg-primary-600 px-4 py-2 font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
                >
                  {isSaving ? 'Saving…' : 'Register member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </MainLayout>
  );
};
