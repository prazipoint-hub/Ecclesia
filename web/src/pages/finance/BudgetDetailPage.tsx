import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { MainLayout } from '@/components/Layout/MainLayout';
import { ErrorBlock, LoadingBlock, card, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { AdminHeader, NoAccess } from '@/pages/admin/adminShared';
import { apiClient } from '@/utils/api';
import type { BudgetVsActual } from '@/types/accounting';
import { ApiError, FinanceNav, money, num, statusBadge, td, th, usePermissions } from './financeShared';

type Item = BudgetVsActual['items'][number];

/** Over budget only matters for spending; going past an income target is good news. */
export const isOverspent = (item: Pick<Item, 'type' | 'percentUsed'>): boolean => item.type === 'EXPENSE' && item.percentUsed > 100;

const Progress = ({ item }: { item: Item }) => {
  const width = Math.min(Math.max(item.percentUsed, 0), 100);
  const over = isOverspent(item);
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-32 overflow-hidden rounded bg-gray-200">
        <div
          role="progressbar"
          aria-label={`${item.accountName} used`}
          aria-valuenow={Math.round(item.percentUsed)}
          aria-valuemin={0}
          aria-valuemax={100}
          style={{ width: `${width}%` }}
          className={`h-full ${over ? 'bg-red-500' : 'bg-primary-500'}`}
        />
      </div>
      <span className={`text-xs tabular-nums ${over ? 'font-medium text-red-600' : 'text-gray-600'}`}>{item.percentUsed}%</span>
    </div>
  );
};

export const BudgetDetailPage = () => {
  const { budgetId } = useParams();
  const has = usePermissions();
  const queryClient = useQueryClient();
  const data = useQuery({ queryKey: ['accounting', 'budgets', budgetId, 'vs-actual'], queryFn: async () => (await apiClient.get<BudgetVsActual>(`/api/v2/accounting/budgets/${budgetId}/vs-actual`)).data });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['accounting', 'budgets'] });
  const approve = useMutation({ mutationFn: () => apiClient.post(`/api/v2/accounting/budgets/${budgetId}/approve`), onSuccess: refresh });
  const closeBudget = useMutation({ mutationFn: () => apiClient.post(`/api/v2/accounting/budgets/${budgetId}/close`), onSuccess: refresh });
  const b = data.data?.budget;
  const t = data.data?.totals;
  const canApprove = has('finance:budget:approve');

  if (!has('finance:view')) return <MainLayout><NoAccess permission="finance:view" /></MainLayout>;

  return (
    <MainLayout>
      <div className="space-y-6">
        <AdminHeader title={b ? `${b.name} (${b.fiscalYear})` : 'Budget'} action={<Link to="/finance/budgets" className={secondaryBtn}>Back to budgets</Link>} />
        <FinanceNav />
        {data.isLoading ? <LoadingBlock /> : data.error ? <ErrorBlock error={data.error} onRetry={() => void data.refetch()} /> : b && t && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span className={statusBadge(b.status)}>{b.status}</span>
              {canApprove && b.status === 'DRAFT' && <button type="button" className={primaryBtn} disabled={approve.isPending} onClick={() => approve.mutate()}>Approve budget</button>}
              {canApprove && b.status === 'APPROVED' && <button type="button" className={secondaryBtn} disabled={closeBudget.isPending} onClick={() => closeBudget.mutate()}>Close budget</button>}
            </div>
            {(approve.error || closeBudget.error) && <ApiError error={approve.error ?? closeBudget.error} />}
            <div className="grid gap-3 sm:grid-cols-3">
              {[['Income', t.revenueBudgeted, t.revenueActual], ['Spending', t.expenseBudgeted, t.expenseActual], ['Surplus', t.surplusBudgeted, t.surplusActual]].map(([label, planned, actual]) => (
                <div key={label as string} className={card}>
                  <p className="text-sm text-gray-500">{label}</p>
                  <p className="text-xl font-medium tabular-nums">{money(actual as number)}</p>
                  <p className="text-xs text-gray-500">of {money(planned as number)} budgeted</p>
                </div>
              ))}
            </div>
            <div className={card}>
              <table className="min-w-full divide-y divide-gray-200">
                <thead><tr><th className={th}>Account</th><th className={`${th} text-right`}>Budgeted</th><th className={`${th} text-right`}>Actual</th><th className={`${th} text-right`}>Variance</th><th className={th}>Used</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {data.data?.items.map((i) => (
                    <tr key={i.id}>
                      <td className={td}>{i.accountCode} {i.accountName}</td>
                      <td className={num}>{money(i.budgeted)}</td><td className={num}>{money(i.actual)}</td>
                      <td className={`${num} ${i.variance < 0 ? 'text-red-600' : 'text-green-700'}`}>{i.variance > 0 ? '+' : ''}{money(i.variance)}</td>
                      <td className={td}><Progress item={i} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-gray-500">Positive variance is favourable: more income than planned, or less spent than planned.</p>
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
};
