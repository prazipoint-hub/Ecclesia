import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
              <article key={e.id} className={card}>
                <h2 className="text-lg font-semibold text-gray-900">{e.title}</h2>
                <p className="text-sm text-gray-500">{label(e.eventType)} · {dateTime(e.startDateTime)}{e.location ? ` · ${e.location}` : ''}</p>
                {e.description && <p className="mt-2 text-sm text-gray-700">{e.description}</p>}
                <p className="mt-3 text-sm text-gray-600">
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
              </article>
            );
          })}
        </div>
      )}
    </Shell>
  );
};
