import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { FormTextarea } from '@/components/forms/FormTextarea';
import { ErrorNotice, SuccessNotice } from '@/pages/auth/AuthShell';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import type { MyProfile, UpdateMyProfileInput } from '@/types/account';
import { ErrorBlock, LoadingBlock, PageHeader, card, formatDate, primaryBtn, titleCase } from './shared';

export const PROFILE_KEY = ['me', 'profile'] as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_MAX = 40;
const ADDRESS_MAX = 500;

interface FieldErrors {
  email?: string;
  phone?: string;
  address?: string;
}

const Detail = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
    <dd className="mt-1 text-sm text-gray-900">{value}</dd>
  </div>
);

export const MyProfilePage = () => {
  const queryClient = useQueryClient();
  const profile = useQuery({
    queryKey: PROFILE_KEY,
    queryFn: async () => (await apiClient.get<MyProfile>('/api/v2/me/profile')).data,
  });

  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (!profile.data) return;
    setEmail(profile.data.email ?? '');
    setPhone(profile.data.phone ?? '');
    setAddress(profile.data.address ?? '');
  }, [profile.data]);

  const save = useMutation({
    mutationFn: async (input: UpdateMyProfileInput) => (await apiClient.put<MyProfile>('/api/v2/me/profile', input)).data,
    onSuccess: (updated) => queryClient.setQueryData(PROFILE_KEY, updated),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    save.reset();
    const current = profile.data;
    if (!current) return;

    const next: FieldErrors = {};
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();
    const trimmedAddress = address.trim();
    if (trimmedEmail && !EMAIL_PATTERN.test(trimmedEmail)) next.email = 'Enter a valid email address.';
    if (!trimmedEmail && current.email) next.email = 'Your email address cannot be removed.';
    if (trimmedPhone.length > PHONE_MAX) next.phone = `Phone number must be at most ${PHONE_MAX} characters.`;
    if (trimmedAddress.length > ADDRESS_MAX) next.address = `Address must be at most ${ADDRESS_MAX} characters.`;
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const input: UpdateMyProfileInput = {};
    if (trimmedEmail && trimmedEmail !== (current.email ?? '')) input.email = trimmedEmail;
    if (trimmedPhone !== (current.phone ?? '')) input.phone = trimmedPhone || null;
    if (trimmedAddress !== (current.address ?? '')) input.address = trimmedAddress || null;
    if (Object.keys(input).length === 0) return;
    save.mutate(input);
  };

  const data = profile.data;

  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader title="My profile" subtitle="Your membership details and contact information." />
        {profile.isLoading && <LoadingBlock label="Loading your profile…" />}
        {profile.isError && <ErrorBlock error={profile.error} onRetry={() => profile.refetch()} />}
        {data && (
          <>
            <section className={card} aria-labelledby="details-heading">
              <h2 id="details-heading" className="text-lg font-medium text-gray-900">
                Membership details
              </h2>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <Detail
                  label="Name"
                  value={[data.firstName, data.middleName, data.lastName].filter(Boolean).join(' ')}
                />
                <Detail label="Membership number" value={data.membershipNumber} />
                <Detail label="Status" value={titleCase(data.membershipStatus)} />
                <Detail label="Church" value={data.church.name} />
                <Detail label="Section" value={data.section?.name ?? '—'} />
                <Detail label="Family" value={data.family?.name ?? '—'} />
                <Detail label="Gender" value={titleCase(data.gender)} />
                <Detail label="Date of birth" value={formatDate(data.dateOfBirth)} />
                <Detail label="Marital status" value={titleCase(data.maritalStatus)} />
                <Detail label="Joined" value={formatDate(data.joinDate)} />
              </dl>
              <p className="mt-4 text-xs text-gray-500">
                To change your name, date of birth or membership status, please contact your church office.
              </p>
            </section>

            <section className={card} aria-labelledby="contact-heading">
              <h2 id="contact-heading" className="text-lg font-medium text-gray-900">
                Contact information
              </h2>
              <form className="mt-4 space-y-4" onSubmit={onSubmit} noValidate>
                {save.isSuccess && <SuccessNotice message="Your profile has been updated." />}
                {save.isError && <ErrorNotice message={getApiErrorMessage(save.error)} />}
                <FormField
                  label="Email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  error={errors.email}
                />
                <FormField
                  label="Phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  error={errors.phone}
                />
                <FormTextarea
                  label="Address"
                  rows={3}
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  error={errors.address}
                />
                <button type="submit" className={primaryBtn} disabled={save.isPending}>
                  {save.isPending ? 'Saving…' : 'Save changes'}
                </button>
              </form>
            </section>
          </>
        )}
      </div>
    </MainLayout>
  );
};

export default MyProfilePage;
