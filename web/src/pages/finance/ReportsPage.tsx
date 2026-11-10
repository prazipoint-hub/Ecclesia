import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Printer } from 'lucide-react';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { ErrorBlock, LoadingBlock, card, secondaryBtn } from '@/pages/account/shared';
import { AdminHeader, NoAccess } from '@/pages/admin/adminShared';
import { apiClient } from '@/utils/api';
import type { BalanceSheet, IncomeStatement, StatementRow, TrialBalance } from '@/types/accounting';
import { FinanceNav, money, num, td, th, today, usePermissions } from './financeShared';

type Tab = 'trial-balance' | 'income-statement' | 'balance-sheet';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'trial-balance', label: 'Trial balance' },
  { id: 'income-statement', label: 'Income statement' },
  { id: 'balance-sheet', label: 'Balance sheet' },
];

const Warning = ({ children }: { children: string }) => (
  <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-800">
    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {children}
  </div>
);

const drill = (id: string, from?: string, to?: string) => `/finance/accounts?account=${id}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`;

const Section = ({ title, rows, total, from, to }: { title: string; rows: StatementRow[]; total?: number; from?: string; to?: string }) => (
  <>
    <tr><td colSpan={2} className="bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-900">{title}</td></tr>
    {rows.map((r) => <tr key={r.accountId}><td className={td}><Link className="underline" to={drill(r.accountId, from, to)}>{r.code} {r.name}</Link></td><td className={num}>{money(r.amount)}</td></tr>)}
    {total !== undefined && <tr><td className={`${td} font-semibold`}>Total {title.toLowerCase()}</td><td className={`${num} font-semibold`}>{money(total)}</td></tr>}
  </>
);

export const FinanceReportsPage = () => {
  const has = usePermissions();
  const [tab, setTab] = useState<Tab>('trial-balance');
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(today());
  const params = tab === 'income-statement' ? { from, to } : { asOf: to };
  const report = useQuery({
    queryKey: ['accounting', 'reports', tab, params],
    enabled: has('finance:view'),
    queryFn: async () => (await apiClient.get<TrialBalance | IncomeStatement | BalanceSheet>(`/api/v2/accounting/reports/${tab}`, { params })).data,
  });
  const d = report.data;

  return (
    <MainLayout>
      <div className="space-y-6">
        <AdminHeader title="Financial reports" action={<button type="button" className={`${secondaryBtn} inline-flex items-center gap-2 print:hidden`} onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</button>} />
        <FinanceNav />
        {!has('finance:view') ? <NoAccess permission="finance:view" /> : (
          <>
            <div role="tablist" className="flex gap-1 print:hidden">
              {TABS.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === t.id ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700'}`}>{t.label}</button>
              ))}
            </div>
            <div className="grid max-w-md grid-cols-2 gap-3 print:hidden">
              {tab === 'income-statement' && <FormField type="date" label="From" value={from} onChange={(e) => setFrom(e.target.value)} />}
              <FormField type="date" label={tab === 'income-statement' ? 'To' : 'As of'} value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            {report.isLoading ? <LoadingBlock /> : report.error ? <ErrorBlock error={report.error} onRetry={() => void report.refetch()} /> : d && (
              <div className={`${card} space-y-3`}>
                {tab === 'trial-balance' && 'rows' in d && (
                  <>
                    {!d.balanced && <Warning>Out of balance: total debits and credits differ. Contact your accountant before relying on this report.</Warning>}
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead><tr><th className={th}>Account</th><th className={`${th} text-right`}>Debit</th><th className={`${th} text-right`}>Credit</th></tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {d.rows.map((r) => <tr key={r.accountId}><td className={td}><Link className="underline" to={drill(r.accountId, undefined, to)}>{r.code} {r.name}</Link></td><td className={num}>{r.debit ? money(r.debit) : ''}</td><td className={num}>{r.credit ? money(r.credit) : ''}</td></tr>)}
                        <tr><td className={`${td} font-semibold`}>Total</td><td className={`${num} font-semibold`}>{money(d.totalDebit)}</td><td className={`${num} font-semibold`}>{money(d.totalCredit)}</td></tr>
                      </tbody>
                    </table>
                  </>
                )}
                {tab === 'income-statement' && 'netSurplus' in d && (
                  <table className="min-w-full"><tbody>
                    <Section title="Income" rows={d.revenue} total={d.totalRevenue} from={from} to={to} />
                    <Section title="Expenses" rows={d.expenses} total={d.totalExpenses} from={from} to={to} />
                    <tr><td className={`${td} font-bold`}>Net surplus</td><td className={`${num} font-bold ${d.netSurplus < 0 ? 'text-red-600' : ''}`}>{money(d.netSurplus)}</td></tr>
                  </tbody></table>
                )}
                {tab === 'balance-sheet' && 'totalAssets' in d && (
                  <>
                    {!d.balanced && <Warning>Out of balance: assets do not equal liabilities plus equity. Contact your accountant before relying on this report.</Warning>}
                    <table className="min-w-full"><tbody>
                      <Section title="Assets" rows={d.assets} total={d.totalAssets} to={to} />
                      <Section title="Liabilities" rows={d.liabilities} total={d.totalLiabilities} to={to} />
                      <Section title="Equity" rows={d.equity} total={d.totalEquity} to={to} />
                    </tbody></table>
                    <p className="text-xs text-gray-500">Equity includes the current surplus of {money(d.currentSurplus)}.</p>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
};
