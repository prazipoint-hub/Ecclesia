import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw, Users } from 'lucide-react';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { FormSelect } from '@/components/forms/FormSelect';
import { Modal } from '@/components/forms/Modal';
import { EmptyBlock, LoadingBlock, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { ErrorNotice } from '@/pages/auth/AuthShell';
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
  const [listError, setListError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
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
    setListError(null);
    try {
      const { data } = await apiClient.get<MemberListResponse>('/api/v2/members', {
        params: { churchId: user.churchId, take: 50 },
      });
      setMembers(data.members);
      setTotal(data.total);
    } catch (loadError) {
      setListError(messageFrom(loadError, 'Members could not be loaded.'));
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
    setCreateError(null);
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
      setCreateError(messageFrom(createError, 'The member could not be created.'));
    } finally {
      setIsSaving(false);
    }
  };

  const openCreate = () => {
    setCreateError(null);
    setIsCreateOpen(true);
  };

  const closeCreate = () => {
    if (isSaving) return;
    setCreateError(null);
    setIsCreateOpen(false);
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-[1440px] space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="page-eyebrow">People</p>
            <h1 className="mt-2 text-3xl font-semibold text-gray-950 sm:text-4xl">Members</h1>
            <p className="mt-2 max-w-2xl text-gray-600">
              Searchable church records and registration in one place.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void loadMembers()}
              disabled={isLoading || !user?.churchId}
              className={secondaryBtn}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button
              type="button"
              onClick={openCreate}
              disabled={!user?.churchId}
              className={primaryBtn}
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
        ) : listError ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800">
            <p>{listError}</p>
            <button
              type="button"
              onClick={() => void loadMembers()}
              className="mt-3 font-semibold underline"
            >
              Try again
            </button>
          </div>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-soft">
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
              <div className="p-5">
                <LoadingBlock label="Loading members…" />
              </div>
            ) : members.length === 0 ? (
              <div className="p-5">
                <EmptyBlock message="No members have been registered in this church yet." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-left">
                  <thead className="bg-gray-50/80 text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500">
                    <tr>
                      <th className="px-5 py-3">Member</th>
                      <th className="px-5 py-3">Membership no.</th>
                      <th className="px-5 py-3">Contact</th>
                      <th className="px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {members.map((member) => (
                      <tr key={member.id} className="hover:bg-primary-50/40">
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

      <Modal
        open={isCreateOpen}
        title="Register member"
        onClose={closeCreate}
        footer={
          <>
            <button
              type="button"
              onClick={closeCreate}
              className={secondaryBtn}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="register-member-form"
              disabled={isSaving}
              className={primaryBtn}
            >
              {isSaving ? 'Saving…' : 'Register member'}
            </button>
          </>
        }
      >
        <form id="register-member-form" onSubmit={createMember} className="space-y-4">
          {createError && <ErrorNotice message={createError} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="First name"
              required
              autoComplete="given-name"
              value={form.firstName}
              onChange={(event) => setForm({ ...form, firstName: event.target.value })}
            />
            <FormField
              label="Last name"
              required
              autoComplete="family-name"
              value={form.lastName}
              onChange={(event) => setForm({ ...form, lastName: event.target.value })}
            />
          </div>
          <FormSelect
            label="Gender"
            value={form.gender}
            onChange={(event) => setForm({ ...form, gender: event.target.value as Gender })}
            options={[
              { value: 'MALE', label: 'Male' },
              { value: 'FEMALE', label: 'Female' },
              { value: 'OTHER', label: 'Other' },
            ]}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
            <FormField
              label="Phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
            />
          </div>
        </form>
      </Modal>
    </MainLayout>
  );
};
