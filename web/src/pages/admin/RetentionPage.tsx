import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { Modal } from '@/components/forms/Modal';
import { ErrorBlock, LoadingBlock, card, formatDate, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { useAuthStore } from '@stores/authStore';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import { can } from '@/types/notifications';
import type { RetentionEntityRow, RetentionRunResult } from '@/types/admin';
import { AdminHeader, NoAccess } from './adminShared';

const PERMISSION = 'admin:retention:manage';
const KEY = ['admin', 'retention'] as const;

const RuleRow = ({ row }: { row: RetentionEntityRow }) => {
  const queryClient = useQueryClient();
  const [days, setDays] = useState(String(row.rule?.retentionDays ?? Math.max(row.minDays, 365)));
  const [active, setActive] = useState(row.rule?.isActive ?? true);
  const refresh = () => queryClient.invalidateQueries({ queryKey: KEY });
  const n = Number(days);
  const tooLow = !Number.isInteger(n) || n < row.minDays;
  const save = useMutation({ mutationFn: async () => apiClient.put('/api/v2/admin/retention', { entityType: row.entityType, retentionDays: n, isActive: active }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: async () => apiClient.delete(`/api/v2/admin/retention/${row.entityType}`), onSuccess: refresh });
  return (
    <li className={card}>
      <p className="font-semibold text-gray-900">{row.label}</p>
      <p className="text-xs text-gray-500">Must be kept at least {row.minDays} day(s).{row.rule?.lastRunAt ? ` Last run ${formatDate(row.rule.lastRunAt)}, removed ${row.rule.lastPurged ?? 0}.` : ''}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="text-sm">Keep for (days) <input aria-label={`Days for ${row.label}`} type="number" value={days} onChange={(e) => setDays(e.target.value)} className="ml-1 w-24 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" /></label>
        <label className="text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>
        <button type="button" className={primaryBtn} disabled={tooLow || save.isPending} onClick={() => save.mutate()} aria-label={`Save rule for ${row.label}`}>Save rule</button>
        {row.rule && <button type="button" className={secondaryBtn} onClick={() => remove.mutate()}>Remove rule</button>}
      </div>
      {tooLow && <p role="alert" className="mt-1 text-xs text-red-600">Enter at least {row.minDays} days.</p>}
      {(save.error ?? remove.error) != null && <div className="mt-2"><ErrorNotice message={getApiErrorMessage(save.error ?? remove.error)} /></div>}
    </li>
  );
};

export const RetentionPage = () => {
  const allowed = can(useAuthStore((s) => s.user?.permissions), PERMISSION);
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<RetentionRunResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const rules = useQuery({ queryKey: KEY, enabled: allowed, queryFn: async () => (await apiClient.get<RetentionEntityRow[]>('/api/v2/admin/retention')).data });
  const run = useMutation({
    mutationFn: async (dryRun: boolean) => (await apiClient.post<RetentionRunResult>('/api/v2/admin/retention/run', { dryRun })).data,
    onSuccess: (data) => { setPreview(data); setConfirming(false); if (!data.dryRun) queryClient.invalidateQueries({ queryKey: KEY }); },
  });
  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <AdminHeader title="Data retention" subtitle="Old records can be removed automatically. Always preview first; deleting cannot be undone." />
        {!allowed && <NoAccess permission={PERMISSION} />}
        {allowed && rules.isLoading && <LoadingBlock />}
        {rules.isError && <ErrorBlock error={rules.error} onRetry={() => rules.refetch()} />}
        {rules.data && <ul className="space-y-3">{rules.data.map((r) => <RuleRow key={r.entityType} row={r} />)}</ul>}
        {rules.data && (
          <section className={`${card} space-y-3`}>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={secondaryBtn} disabled={run.isPending} onClick={() => run.mutate(true)}>Preview what would be removed</button>
              <button type="button" className={primaryBtn} onClick={() => { run.reset(); setConfirming(true); }}>Delete now</button>
            </div>
            {run.error != null && !confirming && <ErrorNotice message={getApiErrorMessage(run.error)} />}
            {preview && (
              <div role="status" className="text-sm">
                <p className="font-semibold">{preview.dryRun ? 'Preview (nothing was deleted)' : 'Deleted'}</p>
                {preview.results.length === 0 ? <p className="text-gray-500">No active rules.</p> : (
                  <ul>{preview.results.map((r) => <li key={r.entityType}>{r.entityType}: {preview.dryRun ? `${r.wouldRemove} would be removed` : `${r.removed} removed`} (older than {r.retentionDays} days)</li>)}</ul>
                )}
              </div>
            )}
          </section>
        )}
      </div>
      <Modal open={confirming} title="Delete old records now" onClose={() => setConfirming(false)}
        footer={<><button type="button" className={secondaryBtn} onClick={() => setConfirming(false)}>Cancel</button><button type="button" className={primaryBtn} disabled={run.isPending} onClick={() => run.mutate(false)}>Yes, delete permanently</button></>}>
        <p className="text-sm text-gray-700">This permanently removes every record older than its rule allows. Run a preview first if you have not.</p>
        {run.error != null && <div className="mt-3"><ErrorNotice message={getApiErrorMessage(run.error)} /></div>}
      </Modal>
    </MainLayout>
  );
};

export default RetentionPage;
