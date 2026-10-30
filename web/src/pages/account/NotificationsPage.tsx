import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/Layout/MainLayout';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import type { NotificationItem, NotificationList } from '@/types/account';
import { EmptyBlock, ErrorBlock, LoadingBlock, PageHeader, Pagination, card, secondaryBtn, titleCase } from './shared';

const PAGE_SIZE = 20;
const LIST_KEY = ['me', 'notifications'] as const;
const COUNT_KEY = ['me', 'notifications-count'] as const;

const ActionLink = ({ url }: { url: string }) => {
  if (url.startsWith('/') && !url.startsWith('//')) {
    return (
      <Link to={url} className="text-sm font-medium text-primary-600 hover:text-primary-700">
        Open
      </Link>
    );
  }
  if (/^https?:\/\//i.test(url)) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary-600 hover:text-primary-700">
        Open
      </a>
    );
  }
  return null;
};

export const NotificationsPage = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const list = useQuery({
    queryKey: [...LIST_KEY, page],
    queryFn: async () =>
      (await apiClient.get<NotificationList>('/api/v2/me/notifications', { params: { page, pageSize: PAGE_SIZE } })).data,
    placeholderData: (previous) => previous,
  });

  const updateCached = (update: (data: NotificationList) => NotificationList) =>
    queryClient.setQueriesData<NotificationList>({ queryKey: LIST_KEY }, (data) => (data ? update(data) : data));

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.put(`/api/v2/me/notifications/${id}/read`);
      return id;
    },
    onSuccess: (id) => {
      updateCached((data) => {
        const target = data.items.find((item) => item.id === id);
        return {
          ...data,
          items: data.items.map((item) => (item.id === id ? { ...item, read: true } : item)),
          unreadCount: target && !target.read ? Math.max(0, data.unreadCount - 1) : data.unreadCount,
        };
      });
      queryClient.invalidateQueries({ queryKey: COUNT_KEY });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await apiClient.put('/api/v2/me/notifications/read-all');
    },
    onSuccess: () => {
      updateCached((data) => ({ ...data, items: data.items.map((item) => ({ ...item, read: true })), unreadCount: 0 }));
      queryClient.invalidateQueries({ queryKey: COUNT_KEY });
    },
  });

  const data = list.data;
  const actionError = markRead.error ?? markAllRead.error;

  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader
          title="Notifications"
          subtitle={data ? `${data.unreadCount} unread` : 'Messages from your church.'}
          action={
            <button
              type="button"
              className={secondaryBtn}
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending || !data || data.unreadCount === 0}
            >
              {markAllRead.isPending ? 'Marking…' : 'Mark all as read'}
            </button>
          }
        />

        {actionError != null && <ErrorNotice message={getApiErrorMessage(actionError)} />}
        {list.isLoading && <LoadingBlock label="Loading notifications…" />}
        {list.isError && <ErrorBlock error={list.error} onRetry={() => list.refetch()} />}
        {data && data.items.length === 0 && <EmptyBlock message="You have no notifications." />}
        {data && data.items.length > 0 && (
          <section className={card} aria-label="Notification list">
            <ul className="divide-y divide-gray-100">
              {data.items.map((item: NotificationItem) => (
                <li key={`${item.source}-${item.id}`} data-unread={!item.read} className={`flex gap-3 py-4 ${item.read ? '' : 'bg-primary-50/60 -mx-3 px-3 rounded-lg'}`}>
                  <span
                    aria-hidden="true"
                    className={`mt-2 h-2 w-2 shrink-0 rounded-full ${item.read ? 'bg-transparent' : 'bg-primary-600'}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={`text-sm text-gray-900 ${item.read ? 'font-medium' : 'font-semibold'}`}>{item.title}</p>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{titleCase(item.type)}</span>
                      {!item.read && <span className="sr-only">Unread</span>}
                    </div>
                    <p className="mt-1 whitespace-pre-line text-sm text-gray-600">{item.body}</p>
                    <div className="mt-2 flex items-center gap-4">
                      <time dateTime={item.createdAt} className="text-xs text-gray-400">
                        {new Date(item.createdAt).toLocaleString()}
                      </time>
                      {item.actionUrl && <ActionLink url={item.actionUrl} />}
                    </div>
                  </div>
                  {!item.read && (
                    <button
                      type="button"
                      className="self-start text-sm font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50"
                      onClick={() => markRead.mutate(item.id)}
                      disabled={markRead.isPending}
                      aria-label={`Mark "${item.title}" as read`}
                    >
                      Mark read
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
          </section>
        )}
      </div>
    </MainLayout>
  );
};

export default NotificationsPage;
