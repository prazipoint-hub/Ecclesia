import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { EmptyBlock, ErrorBlock, LoadingBlock, card, secondaryBtn } from '@/pages/account/shared';
import { AdminHeader } from '@/pages/admin/adminShared';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';

interface Ctx { id: string; role: { id: string; name: string }; scope: { type: string; id: string }; endsAt: string | null }
type Check = { ok: true; permissions: string[] } | { ok: false; message: string };
const KEY = 'lastAccessContext';
const remembered = (): string | null => { try { return localStorage.getItem(KEY); } catch { return null; } };

/**
 * Where you hold a role. Remembering a choice is only a convenience: each unit is re-checked on the server every time you
 * press Check, so a role that was removed or has expired is shown as gone instead of being trusted.
 */
export const ContextsPage = () => {
  const q = useQuery({ queryKey: ['access', 'contexts'], queryFn: async () => (await apiClient.get<{ contexts: Ctx[] }>('/api/v2/access/me/contexts')).data.contexts });
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const [current, setCurrent] = useState<string | null>(remembered());
  const check = async (c: Ctx) => {
    try {
      const { data } = await apiClient.post<{ permissions: string[] }>('/api/v2/access/context/verify', { type: c.scope.type, id: c.scope.id });
      setChecks((s) => ({ ...s, [c.id]: { ok: true, permissions: data.permissions } }));
      try { localStorage.setItem(KEY, c.id); } catch { /* optional */ }
      setCurrent(c.id);
    } catch (e) { setChecks((s) => ({ ...s, [c.id]: { ok: false, message: getApiErrorMessage(e) } })); }
  };
  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <AdminHeader title="Where I hold a role" subtitle="Roles you have been given for a circuit, district, conference or other unit. Check re-confirms with the server." />
        <section className={card}>
          {q.isLoading ? <LoadingBlock /> : q.error ? <ErrorBlock error={q.error} /> : !q.data?.length ? <EmptyBlock message="You hold no unit-level roles. Your church role applies as usual." /> : (
            <ul className="space-y-3">{q.data.map((c) => {
              const r = checks[c.id];
              return (
                <li key={c.id} className="rounded-lg border border-gray-200 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span><strong>{c.role.name}</strong> at {c.scope.type.toLowerCase()} <span className="text-xs text-gray-400">{c.scope.id}</span>{c.endsAt && <span className="text-xs text-gray-500"> · ends {c.endsAt.slice(0, 10)}</span>}{current === c.id && <span className="ml-2 text-xs text-green-700">last checked</span>}</span>
                    <button type="button" className={secondaryBtn} onClick={() => void check(c)}>Check</button>
                  </div>
                  {r?.ok && <p className="mt-1 text-gray-600">Confirmed. You hold {r.permissions.length} permission(s) here.</p>}
                  {r && !r.ok && <p role="alert" className="mt-1 text-red-700">{r.message}</p>}
                </li>
              );
            })}</ul>
          )}
        </section>
      </div>
    </MainLayout>
  );
};
