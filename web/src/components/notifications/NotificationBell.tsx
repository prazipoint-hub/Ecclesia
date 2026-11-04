import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiClient } from '@/utils/api';
import type { NotificationItem, NotificationList } from '@/types/account';

const ROOT_KEY = ['me', 'notifications'] as const;
const BELL_KEY = [...ROOT_KEY, 'bell'] as const;
const REFRESH_MS = 60_000;

export const NotificationBell = () => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: BELL_KEY,
    queryFn: async () => (await apiClient.get<NotificationList>('/api/v2/me/notifications', { params: { page: 1, pageSize: 5 } })).data,
    refetchInterval: REFRESH_MS,
  });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ROOT_KEY });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.put(`/api/v2/me/notifications/${id}/read`);
    },
    onSuccess: refresh,
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await apiClient.put('/api/v2/me/notifications/read-all');
    },
    onSuccess: refresh,
  });

  const unread = data?.unreadCount ?? 0;
  const items: NotificationItem[] = data?.items ?? [];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-haspopup="true"
        aria-expanded={open}
        className="relative rounded-lg p-2 text-gray-600 hover:bg-gray-100"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span
            data-testid="unread-badge"
            className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-xs font-semibold text-white"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div role="region" aria-label="Recent notifications" className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Notifications</h2>
            <button
              type="button"
              className="text-xs font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50"
              onClick={() => markAllRead.mutate()}
              disabled={unread === 0 || markAllRead.isPending}
            >
              Mark all read
            </button>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-500">You&apos;re all caught up.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto">
              {items.map((item) => (
                <li key={`${item.source}-${item.id}`}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!item.read) markRead.mutate(item.id);
                    }}
                    className={`block w-full px-4 py-3 text-left hover:bg-gray-50 ${item.read ? '' : 'bg-primary-50/60'}`}
                  >
                    <span className={`block text-sm text-gray-900 ${item.read ? 'font-medium' : 'font-semibold'}`}>
                      {!item.read && <span className="sr-only">Unread: </span>}
                      {item.title}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-xs text-gray-600">{item.body}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-gray-100 px-4 py-2 text-center">
            <Link to="/my-account/notifications" onClick={() => setOpen(false)} className="text-sm font-medium text-primary-600 hover:text-primary-700">
              View all
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
