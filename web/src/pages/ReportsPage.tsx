import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { ErrorBlock, LoadingBlock, card, primaryBtn } from '@/pages/account/shared';
import { R, Shell, label } from '@/pages/reports/reportsShared';
import { CATEGORIES } from '@/types/reports';
import type { CatalogEntry } from '@/types/reports';
import { apiClient } from '@/utils/api';

const CATEGORY_TITLES: Record<string, string> = {
  FINANCIAL: 'Financial', ACCOUNTING: 'Accounting ledger', MEMBERSHIP: 'Membership', ATTENDANCE: 'Attendance', AUDIT: 'Audit',
};

/** The report catalog: everything the system can produce, with what you are allowed to run. */
export const ReportsPage = () => {
  const catalog = useQuery({ queryKey: ['reports', 'catalog'], queryFn: async () => (await apiClient.get<CatalogEntry[]>(`${R}/catalog`)).data });

  return (
    <Shell title="Reports" subtitle="Choose a report to run, save or schedule.">
      {catalog.isLoading ? <LoadingBlock /> : catalog.error ? <ErrorBlock error={catalog.error} onRetry={() => void catalog.refetch()} /> : (
        <div className="space-y-6">
          {CATEGORIES.map((category) => {
            const entries = (catalog.data ?? []).filter((e) => e.category === category);
            if (entries.length === 0) return null;
            return (
              <section key={category} className="space-y-3">
                <div className="flex items-center gap-3"><span className="h-px flex-1 bg-gray-200" /><h2 className="text-sm font-medium uppercase tracking-[0.12em] text-gray-500">{CATEGORY_TITLES[category]}</h2><span className="h-px flex-1 bg-gray-200" /></div>
                <div className="grid gap-4 md:grid-cols-2">
                  {entries.map((entry) => (
                    <article key={entry.type} aria-disabled={!entry.allowed} className={`${card} flex items-start justify-between gap-4 transition-all ${entry.allowed ? 'hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-lg' : 'bg-gray-50/70 opacity-70'}`}>
                      <div>
                        <div className="flex items-center gap-3"><span className="rounded-md bg-primary-50 p-2 text-primary-700"><FileText className="h-4 w-4" /></span><h3 className="font-medium text-gray-900">{entry.label}</h3></div>
                        <p className="mt-1 text-xs text-gray-500">{label(entry.type)}{entry.needsDates ? ' · needs a period' : ''}</p>
                        {!entry.allowed && <p className="mt-2 text-sm text-gray-600">Needs <code className="rounded bg-gray-100 px-1">{entry.permission}</code></p>}
                      </div>
                      {entry.allowed ? (
                        <Link to={`/reports/build?type=${entry.type}`} className={primaryBtn}>Build / run</Link>
                      ) : (
                        <button type="button" className={`${primaryBtn} cursor-not-allowed opacity-50`} disabled>Build / run</button>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </Shell>
  );
};
