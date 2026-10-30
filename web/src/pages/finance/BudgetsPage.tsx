import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { Modal } from '@/components/forms/Modal';
import { EmptyBlock, ErrorBlock, LoadingBlock, card, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { AdminHeader, NoAccess } from '@/pages/admin/adminShared';
import { apiClient } from '@/utils/api';
import type { BudgetInput, BudgetSummary } from '@/types/accounting';
import { useAccounts, useFunds } from './financeQueries';
import { ApiError, FinanceNav, statusBadge, td, th, toDateInput, usePermissions } from './financeShared';

const KEY = ['accounting', 'budgets'] as const;
const sel = 'block w-full rounded-lg border border-gray-300 px-2 py-2 text-sm';
interface Row { accountId: string; fundId: string; amount: string }

const BudgetForm = ({ onDone }: { onDone: () => void }) => {
  const queryClient = useQueryClient();
  const accounts = useAccounts();
  const funds = useFunds();
  const [name, setName] = useState('');
  const [fiscalYear, setFiscalYear] = useState(String(new Date().getFullYear()));
  const [rows, setRows] = useState<Row[]>([{ accountId: '', fundId: '', amount: '' }]);
  const eligible = (accounts.data ?? []).filter((a) => a.isActive && (a.type === 'REVENUE' || a.type === 'EXPENSE'));
  const valid = name.trim() !== '' && rows.length > 0 && rows.every((r) => r.accountId && Number(r.amount) > 0);
  const create = useMutation({
    mutationFn: () => {
      const body: BudgetInput = {
        name: name.trim(), fiscalYear: Number(fiscalYear),
        items: rows.map((r) => ({ accountId: r.accountId, amount: Number(r.amount), ...(r.fundId && { fundId: r.fundId }) })),
      };
      return apiClient.post('/api/v2/accounting/budgets', body);
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: KEY }); onDone(); },
  });
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (valid) create.mutate(); }} className="space-y-3">
      {create.error && <ApiError error={create.error} />}
      <div className="grid grid-cols-3 gap-3">
        <FormField className="col-span-2" label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <FormField type="number" label="Fiscal year" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} />
      </div>
      <div className="max-h-64 space-y-2 overflow-auto">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-12 gap-2">
            <select aria-label={`Item ${i + 1} account`} className={`${sel} col-span-5`} value={r.accountId} onChange={(e) => set(i, { accountId: e.target.value })}>
              <option value="">Account</option>
              {eligible.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
            </select>
            <select aria-label={`Item ${i + 1} fund`} className={`${sel} col-span-3`} value={r.fundId} onChange={(e) => set(i, { fundId: e.target.value })}>
              <option value="">All funds</option>
              {(funds.data ?? []).filter((f) => f.isActive).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <input aria-label={`Item ${i + 1} amount`} type="number" min="0" step="0.01" className={`${sel} col-span-3 text-right`} value={r.amount} onChange={(e) => set(i, { amount: e.target.value })} />
            <button type="button" aria-label={`Remove item ${i + 1}`} className="text-gray-500" disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, idx) => idx !== i))}>×</button>
          </div>
        ))}
      </div>
      <button type="button" className="text-sm font-medium text-primary-600" onClick={() => setRows([...rows, { accountId: '', fundId: '', amount: '' }])}>Add item</button>
      <div className="flex justify-end gap-2">
        <button type="button" className={secondaryBtn} onClick={onDone}>Cancel</button>
        <button type="submit" className={primaryBtn} disabled={!valid || create.isPending}>{create.isPending ? 'Saving…' : 'Create budget'}</button>
      </div>
    </form>
  );
};

export const BudgetsPage = () => {
  const has = usePermissions();
  const [adding, setAdding] = useState(false);
  const budgets = useQuery({ queryKey: KEY, queryFn: async () => (await apiClient.get<BudgetSummary[]>('/api/v2/accounting/budgets')).data });
  return (
    <MainLayout>
      <div className="space-y-6">
        <AdminHeader title="Budgets" subtitle="Plan income and spending per year, then track actuals." action={has('finance:budget:create') && <button type="button" className={primaryBtn} onClick={() => setAdding(true)}>New budget</button>} />
        <FinanceNav />
        {!has('finance:view') ? <NoAccess permission="finance:view" /> : budgets.isLoading ? <LoadingBlock /> : budgets.error ? <ErrorBlock error={budgets.error} onRetry={() => void budgets.refetch()} /> : budgets.data && budgets.data.length === 0 ? <EmptyBlock message="No budgets yet." /> : (
          <div className={card}>
            <table className="min-w-full divide-y divide-gray-200">
              <thead><tr><th className={th}>Name</th><th className={th}>Year</th><th className={th}>Items</th><th className={th}>Status</th><th className={th}>Approved</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {budgets.data?.map((b) => (
                  <tr key={b.id}>
                    <td className={td}><Link className="font-medium text-primary-600 hover:underline" to={`/finance/budgets/${b.id}`}>{b.name}</Link></td>
                    <td className={td}>{b.fiscalYear}</td><td className={td}>{b.itemCount}</td>
                    <td className={td}><span className={statusBadge(b.status)}>{b.status}</span></td><td className={td}>{toDateInput(b.approvedAt) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Modal open={adding} title="New budget" onClose={() => setAdding(false)}><BudgetForm onDone={() => setAdding(false)} /></Modal>
    </MainLayout>
  );
};
