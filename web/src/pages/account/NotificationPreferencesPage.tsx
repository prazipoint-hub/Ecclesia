import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  CATEGORY_LABELS,
  CHANNEL_LABELS,
  CHANNEL_NOTES,
  type NotificationCategory,
  type NotificationChannel,
  type PreferencesResponse,
} from '@/types/notifications';
import { ErrorBlock, LoadingBlock, PageHeader, card } from './shared';

export const PREFERENCES_KEY = ['notifications', 'preferences'] as const;

type Change = { category: NotificationCategory; channel: NotificationChannel; enabled: boolean };

const withChange = (data: PreferencesResponse, change: Change): PreferencesResponse => ({
  categories: data.categories.map((row) =>
    row.category === change.category
      ? { ...row, channels: row.channels.map((c) => (c.channel === change.channel ? { ...c, enabled: change.enabled, isDefault: false } : c)) }
      : row
  ),
});

export const NotificationPreferencesPage = () => {
  const queryClient = useQueryClient();

  const preferences = useQuery({
    queryKey: PREFERENCES_KEY,
    queryFn: async () => (await apiClient.get<PreferencesResponse>('/api/v2/notifications/preferences')).data,
  });

  const save = useMutation({
    mutationFn: async (change: Change) =>
      (await apiClient.put<PreferencesResponse>('/api/v2/notifications/preferences', { preferences: [change] })).data,
    onMutate: async (change) => {
      await queryClient.cancelQueries({ queryKey: PREFERENCES_KEY });
      const previous = queryClient.getQueryData<PreferencesResponse>(PREFERENCES_KEY);
      if (previous) queryClient.setQueryData(PREFERENCES_KEY, withChange(previous, change));
      return { previous };
    },
    onError: (_error, _change, context) => {
      if (context?.previous) queryClient.setQueryData(PREFERENCES_KEY, context.previous);
    },
    onSuccess: (data) => queryClient.setQueryData(PREFERENCES_KEY, data),
  });

  const data = preferences.data;
  const channels = data?.categories[0]?.channels.map((c) => c.channel) ?? [];

  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader title="Notification preferences" subtitle="Choose how your church can reach you for each kind of message." />
        {save.isError && <ErrorNotice message={`Your change was not saved. ${getApiErrorMessage(save.error)}`} />}
        {preferences.isLoading && <LoadingBlock />}
        {preferences.isError && <ErrorBlock error={preferences.error} onRetry={() => preferences.refetch()} />}
        {data && (
          <section className={`${card} overflow-x-auto`} aria-label="Notification preferences">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th scope="col" className="pb-3 pr-4 font-medium">
                    Message type
                  </th>
                  {channels.map((channel) => (
                    <th key={channel} scope="col" className="pb-3 px-2 text-center font-medium">
                      {CHANNEL_LABELS[channel]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.categories.map((row) => (
                  <tr key={row.category}>
                    <th scope="row" className="py-3 pr-4 text-left font-medium text-gray-900">
                      {CATEGORY_LABELS[row.category]}
                    </th>
                    {row.channels.map((c) => (
                      <td key={c.channel} className="px-2 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={c.enabled}
                          disabled={!c.available}
                          onChange={(event) => save.mutate({ category: row.category, channel: c.channel, enabled: event.target.checked })}
                          aria-label={`${CATEGORY_LABELS[row.category]} via ${CHANNEL_LABELS[c.channel]}`}
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
                        />
                        {!c.available && <span className="block text-xs text-gray-400">{CHANNEL_NOTES[c.channel] ?? 'unavailable'}</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </MainLayout>
  );
};

export default NotificationPreferencesPage;
