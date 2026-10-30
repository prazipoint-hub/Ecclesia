import { useQuery } from '@tanstack/react-query';
import { Bell, Wallet, UserRound, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/Layout/MainLayout';
import { apiClient } from '@/utils/api';
import type { GivingSummary, MyProfile, NotificationList } from '@/types/account';
import { PROFILE_KEY } from './MyProfilePage';
import { ErrorBlock, LoadingBlock, card, formatMoney, titleCase } from './shared';

const links: Array<{ to: string; label: string; description: string; icon: LucideIcon }> = [
  { to: '/my-account/profile', label: 'Profile', description: 'View and update your details', icon: UserRound },
  { to: '/my-account/giving', label: 'Giving', description: 'Receipts, totals and statements', icon: Wallet },
  { to: '/my-account/family', label: 'Family', description: 'Your household and relationships', icon: Users },
  { to: '/my-account/notifications', label: 'Notifications', description: 'Messages from your church', icon: Bell },
];

export const MyAccountPage = () => {
  const profile = useQuery({
    queryKey: PROFILE_KEY,
    queryFn: async () => (await apiClient.get<MyProfile>('/api/v2/me/profile')).data,
  });
  const summary = useQuery({
    queryKey: ['me', 'giving-summary', 'current'],
    queryFn: async () => (await apiClient.get<GivingSummary>('/api/v2/me/giving/summary')).data,
  });
  const notifications = useQuery({
    queryKey: ['me', 'notifications-count'],
    queryFn: async () =>
      (await apiClient.get<NotificationList>('/api/v2/me/notifications', { params: { page: 1, pageSize: 1 } })).data,
  });

  const data = profile.data;

  return (
    <MainLayout>
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-primary-600">My Account</p>
          <h1 className="mt-1 text-3xl font-bold text-gray-900">{data ? `Welcome, ${data.firstName}` : 'Welcome'}</h1>
          <p className="mt-2 text-gray-600">Your membership, giving and messages in one place.</p>
        </div>

        {profile.isLoading && <LoadingBlock label="Loading your account…" />}
        {profile.isError && <ErrorBlock error={profile.error} onRetry={() => profile.refetch()} />}

        <div className="grid gap-6 md:grid-cols-3">
          <section className={`${card} md:col-span-1`} aria-labelledby="summary-profile">
            <h2 id="summary-profile" className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Membership
            </h2>
            {data ? (
              <div className="mt-3 space-y-1 text-sm text-gray-700">
                <p className="text-lg font-semibold text-gray-900">
                  {data.firstName} {data.lastName}
                </p>
                <p>No. {data.membershipNumber}</p>
                <p>{titleCase(data.membershipStatus)}</p>
                <p>{data.church.name}</p>
                {data.section && <p>{data.section.name}</p>}
              </div>
            ) : (
              !profile.isError && <p className="mt-3 text-sm text-gray-500">—</p>
            )}
          </section>

          <section className={card} aria-labelledby="summary-giving">
            <h2 id="summary-giving" className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              {summary.data ? `Giving in ${summary.data.year}` : 'Giving this year'}
            </h2>
            {summary.isLoading && <LoadingBlock />}
            {summary.isError && <ErrorBlock error={summary.error} />}
            {summary.data &&
              (summary.data.totals.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500">No giving recorded this year.</p>
              ) : (
                <ul className="mt-3 space-y-1">
                  {summary.data.totals.map((total) => (
                    <li key={total.currency} className="text-2xl font-bold text-gray-900">
                      {formatMoney(total.total, total.currency)}
                      <span className="ml-2 text-xs font-normal text-gray-500">
                        {total.count} {total.count === 1 ? 'receipt' : 'receipts'}
                      </span>
                    </li>
                  ))}
                </ul>
              ))}
          </section>

          <section className={card} aria-labelledby="summary-notifications">
            <h2 id="summary-notifications" className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Notifications
            </h2>
            {notifications.isLoading && <LoadingBlock />}
            {notifications.isError && <ErrorBlock error={notifications.error} />}
            {notifications.data && (
              <p className="mt-3 text-2xl font-bold text-gray-900">
                {notifications.data.unreadCount}
                <span className="ml-2 text-sm font-normal text-gray-500">unread</span>
              </p>
            )}
          </section>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {links.map(({ to, label, description, icon: Icon }) => (
            <Link key={to} to={to} className={`${card} flex items-center gap-4 hover:border-primary-300`}>
              <span className="rounded-lg bg-primary-50 p-3 text-primary-600">
                <Icon className="h-5 w-5" />
              </span>
              <span>
                <span className="block font-semibold text-gray-900">{label}</span>
                <span className="block text-sm text-gray-500">{description}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </MainLayout>
  );
};

export default MyAccountPage;
