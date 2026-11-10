import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { Modal } from '@/components/forms/Modal';
import { ErrorBlock, LoadingBlock, formatDate, primaryBtn, secondaryBtn, titleCase } from '@/pages/account/shared';
import { NoAccess } from '@/pages/admin/adminShared';
import { useAuthStore } from '@stores/authStore';
import { apiClient } from '@/utils/api';
import { can, fullName, type MemberDetail } from '@/types/people';
import { BackLink, Badge, FormError, Header } from './peopleShared';

const Row = ({ label, value }: { label: string; value: string | null | undefined }) => (
  <div>
    <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
    <dd className="mt-1 break-words text-gray-900">{value || '—'}</dd>
  </div>
);

export const MemberDetailPage = () => {
  const { id = '' } = useParams();
  const permissions = useAuthStore((s) => s.user?.permissions);
  const allowed = can(permissions, 'member:view');
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const member = useQuery({
    queryKey: ['members', 'detail', id],
    enabled: allowed && Boolean(id),
    queryFn: async () => (await apiClient.get<MemberDetail>(`/api/v2/members/${id}`)).data,
  });

  const archived = Boolean(member.data?.archivedAt);
  const toggle = useMutation({
    mutationFn: async () => (await apiClient.put(`/api/v2/members/${id}/${archived ? 'restore' : 'archive'}`)).data,
    onSuccess: async () => {
      setConfirming(false);
      await queryClient.invalidateQueries({ queryKey: ['members'] });
    },
  });

  const m = member.data;
  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        {!allowed ? (
          <NoAccess permission="member:view" />
        ) : member.isLoading ? (
          <LoadingBlock label="Loading member…" />
        ) : member.isError ? (
          <ErrorBlock error={member.error} onRetry={() => void member.refetch()} />
        ) : (
          m && (
            <>
              <Header
                back={<BackLink to="/members/search">Member directory</BackLink>}
                title={fullName(m)}
                subtitle={`Membership number ${m.membershipNumber}`}
                action={
                  can(permissions, 'member:archive') && (
                    <button type="button" className={archived ? primaryBtn : secondaryBtn} onClick={() => setConfirming(true)}>
                      {archived ? 'Restore member' : 'Archive member'}
                    </button>
                  )
                }
              />
              <div className="flex flex-wrap gap-2">
                <Badge value={m.membershipStatus} />
                {archived && <Badge value="INACTIVE" label={`Archived ${formatDate(m.archivedAt)}`} />}
              </div>
              <dl className="grid gap-5 rounded-md border border-gray-200 bg-white p-6 shadow-sm sm:grid-cols-2">
                <Row label="Email" value={m.email} />
                <Row label="Phone" value={m.phone} />
                <Row label="Gender" value={titleCase(m.gender)} />
                <Row label="Date of birth" value={m.dateOfBirth ? formatDate(m.dateOfBirth) : null} />
                <Row label="Marital status" value={m.maritalStatus ? titleCase(m.maritalStatus) : null} />
                <Row label="Member since" value={formatDate(m.membershipDate)} />
                <Row label="Church" value={m.church?.name} />
                <Row label="Address" value={m.address} />
              </dl>
            </>
          )
        )}
      </div>
      <Modal
        open={confirming}
        title={archived ? 'Restore this member?' : 'Archive this member?'}
        onClose={() => setConfirming(false)}
        footer={
          <>
            <button type="button" className={secondaryBtn} onClick={() => setConfirming(false)}>Cancel</button>
            <button type="button" className={primaryBtn} disabled={toggle.isPending} onClick={() => toggle.mutate()}>
              {toggle.isPending ? 'Saving…' : archived ? 'Restore' : 'Archive'}
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-700">
          {archived
            ? 'The member will appear in the directory and mailings again.'
            : 'Archived members are hidden from the directory and mailings, are signed out, and can no longer sign in. Their history is kept and you can restore them later.'}
        </p>
        <div className="mt-3"><FormError error={toggle.error} /></div>
      </Modal>
    </MainLayout>
  );
};
