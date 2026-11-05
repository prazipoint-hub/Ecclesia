import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, MapPin, Users } from 'lucide-react';
import { EmptyBlock, ErrorBlock, LoadingBlock, card, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { apiClient } from '@/utils/api';
import type { UpcomingEvent } from '@/types/events';
import { ApiError, E, Shell, dateTime, label } from './eventsShared';

export const UpcomingEventsPage = () => {
  const queryClient = useQueryClient();
  const events = useQuery({ queryKey: ['events', 'upcoming'], queryFn: async () => (await apiClient.get<UpcomingEvent[]>(`${E}/upcoming`)).data });
  const change = useMutation({
    mutationFn: ({ id, register }: { id: string; register: boolean }) => (register ? apiClient.post(`${E}/${id}/register`, {}) : apiClient.delete(`${E}/${id}/register`)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['events', 'upcoming'] }),
  });

  return (
    <Shell title="Upcoming events" subtitle="Sign up for what is coming next.">
      <ApiError error={change.error} />
      {events.isLoading ? <LoadingBlock /> : events.error ? <ErrorBlock error={events.error} onRetry={() => void events.refetch()} /> : !events.data?.length ? <EmptyBlock message="No upcoming events." /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {events.data.map((e) => {
            const full = e.spotsLeft === 0 && !e.registeredByMe;
            return (
              <article key={e.id} className={`${card} overflow-hidden !p-0`}>
                <div className="h-1.5 bg-gradient-to-r from-primary-600 via-primary-400 to-accent-500" />
                <div className="p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3"><div><p className="page-eyebrow">{label(e.eventType)} event</p><h2 className="mt-2 text-lg font-semibold text-gray-950">{e.title}</h2></div><span className="rounded-xl bg-primary-50 p-2.5 text-primary-700"><CalendarDays className="h-5 w-5" /></span></div>
                <p className="mt-3 flex items-center gap-2 text-sm text-gray-600"><CalendarDays className="h-4 w-4 text-gray-400" />{dateTime(e.startDateTime)}</p>
                {e.location && <p className="mt-2 flex items-center gap-2 text-sm text-gray-600"><MapPin className="h-4 w-4 text-gray-400" />{e.location}</p>}
                {e.description && <p className="mt-2 text-sm text-gray-700">{e.description}</p>}
                <p className="mt-3 flex items-center gap-2 text-sm text-gray-600"><Users className="h-4 w-4 text-gray-400" />
                  {e.registered} registered{e.spotsLeft !== null && ` · ${e.spotsLeft} spot${e.spotsLeft === 1 ? '' : 's'} left`}
                  {e.registrationRequired && ' · Registration required'}
                </p>
                <div className="mt-4">
                  {e.registeredByMe ? (
                    <button type="button" className={secondaryBtn} disabled={change.isPending} onClick={() => change.mutate({ id: e.id, register: false })}>Cancel registration</button>
                  ) : (
                    <button type="button" className={primaryBtn} disabled={full || change.isPending} onClick={() => change.mutate({ id: e.id, register: true })}>{full ? 'Full' : 'Register'}</button>
                  )}
                </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Shell>
  );
};
