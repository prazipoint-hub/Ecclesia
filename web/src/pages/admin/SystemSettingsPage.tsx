import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { ErrorBlock, LoadingBlock, card, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { useAuthStore } from '@stores/authStore';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import { can } from '@/types/notifications';
import type { SystemSettingRow } from '@/types/admin';
import { AdminHeader, NoAccess } from './adminShared';

const PERMISSION = 'admin:settings:manage';
const KEY = ['admin', 'settings'] as const;

const SettingCard = ({ setting }: { setting: SystemSettingRow }) => {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(String(setting.value));
  const refresh = () => queryClient.invalidateQueries({ queryKey: KEY });
  const save = useMutation({ mutationFn: async () => apiClient.put(`/api/v2/admin/settings/${setting.key}`, { value: Number(value) }), onSuccess: refresh });
  const reset = useMutation({ mutationFn: async () => apiClient.delete(`/api/v2/admin/settings/${setting.key}`), onSuccess: () => { setValue(String(setting.default)); refresh(); } });
  const valid = value.trim() !== '' && Number.isFinite(Number(value));
  const id = `setting-${setting.key}`;
  return (
    <li className={card}>
      <label htmlFor={id} className="font-semibold text-gray-900">{setting.key}</label>
      <p className="text-sm text-gray-600">{setting.description}</p>
      <p className="text-xs text-gray-500">Used by: {setting.usedBy} · default {setting.default}{setting.isDefault ? '' : ' (changed)'}</p>
      <div className="mt-3 flex items-center gap-2">
        <input id={id} type="number" value={value} onChange={(e) => setValue(e.target.value)} className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        <button type="button" className={primaryBtn} disabled={!valid || save.isPending} onClick={() => save.mutate()} aria-label={`Save ${setting.key}`}>Save</button>
        <button type="button" className={secondaryBtn} disabled={setting.isDefault || reset.isPending} onClick={() => reset.mutate()} aria-label={`Reset ${setting.key}`}>Reset to default</button>
      </div>
      {(save.error ?? reset.error) != null && <div className="mt-2"><ErrorNotice message={getApiErrorMessage(save.error ?? reset.error)} /></div>}
    </li>
  );
};

export const SystemSettingsPage = () => {
  const allowed = can(useAuthStore((s) => s.user?.permissions), PERMISSION);
  const settings = useQuery({ queryKey: KEY, enabled: allowed, queryFn: async () => (await apiClient.get<SystemSettingRow[]>('/api/v2/admin/settings')).data });
  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <AdminHeader title="System settings" subtitle="Only settings that the system actually uses are listed. The server checks every value." />
        {!allowed && <NoAccess permission={PERMISSION} />}
        {allowed && settings.isLoading && <LoadingBlock />}
        {settings.isError && <ErrorBlock error={settings.error} onRetry={() => settings.refetch()} />}
        {settings.data && <ul className="space-y-3">{settings.data.map((s) => <SettingCard key={`${s.key}:${s.value}`} setting={s} />)}</ul>}
      </div>
    </MainLayout>
  );
};

export default SystemSettingsPage;
