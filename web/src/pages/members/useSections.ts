import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@stores/authStore';
import { apiClient } from '@/utils/api';

export interface SectionOption { id: string; name: string }

/** Sections of the signed-in user's church, for filters and pickers. Failing quietly is fine: the pickers just stay empty. */
export const useSections = (enabled = true) => {
  const churchId = useAuthStore((s) => s.user?.churchId);
  return useQuery({
    queryKey: ['sections', churchId],
    enabled: enabled && Boolean(churchId),
    queryFn: async () => (await apiClient.get<{ sections: SectionOption[] }>('/api/v2/sections', { params: { churchId, take: 200 } })).data.sections ?? [],
  });
};
