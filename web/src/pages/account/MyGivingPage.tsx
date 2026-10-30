import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormSelect } from '@/components/forms/FormSelect';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import type { GivingList, GivingSummary, ReceiptStatus } from '@/types/account';
import {
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  Pagination,
  card,
  formatDate,
  formatMoney,
  secondaryBtn,
  titleCase,
} from './shared';

const PAGE_SIZE = 20;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STATUS_STYLES: Record<ReceiptStatus, string> = {
  ISSUED: 'bg-green-100 text-green-700',
  VOIDED: 'bg-gray-200 text-gray-700',
  REVERSED: 'bg-amber-100 text-amber-800',
};

const MonthlyBars = ({ currency, byMonth }: { currency: string; byMonth: GivingSummary['byMonth'] }) => {
  const totals = MONTHS.map((_, index) => byMonth.find((entry) => entry.currency === currency && entry.month === index + 1)?.total ?? 0);
  const max = Math.max(...totals, 0);
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{currency} by month</p>
      <div className="flex h-32 items-end gap-1.5" role="img" aria-label={`Monthly giving in ${currency}`}>
        {totals.map((total, index) => (
          <div key={MONTHS[index]} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <div
              title={`${MONTHS[index]}: ${formatMoney(total, currency)}`}
              className="w-full rounded-t bg-primary-500"
              style={{ height: max > 0 ? `${Math.max((total / max) * 100, total > 0 ? 3 : 0)}%` : '0%' }}
            />
            <span className="text-[10px] text-gray-500">{MONTHS[index]}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const MyGivingPage = () => {
  const [year, setYear] = useState(new Date().getFullYear());
  const [page, setPage] = useState(1);

  const summary = useQuery({
    queryKey: ['me', 'giving-summary', year],
    queryFn: async () => (await apiClient.get<GivingSummary>('/api/v2/me/giving/summary', { params: { year } })).data,
  });
  const list = useQuery({
    queryKey: ['me', 'giving', year, page],
    queryFn: async () =>
      (await apiClient.get<GivingList>('/api/v2/me/giving', { params: { year, page, pageSize: PAGE_SIZE } })).data,
    placeholderData: (previous) => previous,
  });

  const yearOptions = useMemo(() => {
    const years = new Set<number>([year, ...(summary.data?.availableYears ?? []), ...(list.data?.availableYears ?? [])]);
    return [...years].sort((a, b) => b - a).map((value) => ({ value: String(value), label: String(value) }));
  }, [year, summary.data, list.data]);

  const currencies = useMemo(() => [...new Set((summary.data?.byMonth ?? []).map((entry) => entry.currency))], [summary.data]);

  const download = useMutation({
    mutationFn: async () => {
      const response = await apiClient.get<Blob>('/api/v2/me/giving/statement', { params: { year }, responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `giving-statement-${year}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    },
  });

  return (
    <MainLayout>
      <div className="mx-auto max-w-5xl space-y-6">
        <PageHeader
          title="My giving"
          subtitle="Your receipts and giving totals."
          action={
            <div className="flex items-end gap-3">
              <FormSelect
                label="Year"
                value={String(year)}
                options={yearOptions}
                onChange={(event) => {
                  setYear(Number(event.target.value));
                  setPage(1);
                }}
              />
              <button type="button" className={`${secondaryBtn} flex items-center gap-2`} onClick={() => download.mutate()} disabled={download.isPending}>
                <Download className="h-4 w-4" />
                {download.isPending ? 'Preparing…' : 'Download statement'}
              </button>
            </div>
          }
        />

        {download.isError && <ErrorNotice message={getApiErrorMessage(download.error, 'The statement could not be downloaded.')} />}

        <section className={card} aria-labelledby="totals-heading">
          <h2 id="totals-heading" className="text-lg font-semibold text-gray-900">
            {year} summary
          </h2>
          {summary.isLoading && <LoadingBlock />}
          {summary.isError && <ErrorBlock error={summary.error} onRetry={() => summary.refetch()} />}
          {summary.data &&
            (summary.data.totals.length === 0 ? (
              <div className="mt-4">
                <EmptyBlock message={`No giving recorded for ${year}.`} />
              </div>
            ) : (
              <div className="mt-4 space-y-6">
                <ul className="grid gap-4 sm:grid-cols-2">
                  {summary.data.totals.map((total) => (
                    <li key={total.currency} className="rounded-lg bg-gray-50 p-4">
                      <p className="text-2xl font-bold text-gray-900">{formatMoney(total.total, total.currency)}</p>
                      <p className="text-xs text-gray-500">
                        {total.count} {total.count === 1 ? 'receipt' : 'receipts'}
                      </p>
                    </li>
                  ))}
                </ul>

                <div>
                  <h3 className="text-sm font-semibold text-gray-700">By type</h3>
                  <ul className="mt-2 divide-y divide-gray-100 text-sm">
                    {summary.data.byIncomeType.map((entry) => (
                      <li key={`${entry.incomeType}-${entry.currency}`} className="flex justify-between py-2">
                        <span className="text-gray-600">{titleCase(entry.incomeType)}</span>
                        <span className="font-medium text-gray-900">{formatMoney(entry.total, entry.currency)}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-4">
                  {currencies.map((currency) => (
                    <MonthlyBars key={currency} currency={currency} byMonth={summary.data.byMonth} />
                  ))}
                </div>
              </div>
            ))}
        </section>

        <section className={card} aria-labelledby="receipts-heading">
          <h2 id="receipts-heading" className="text-lg font-semibold text-gray-900">
            Receipts
          </h2>
          {list.isLoading && <LoadingBlock />}
          {list.isError && <ErrorBlock error={list.error} onRetry={() => list.refetch()} />}
          {list.data &&
            (list.data.items.length === 0 ? (
              <div className="mt-4">
                <EmptyBlock message={`No receipts for ${year}.`} />
              </div>
            ) : (
              <>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="py-2 pr-4">Date</th>
                        <th className="py-2 pr-4">Receipt</th>
                        <th className="py-2 pr-4">Fund</th>
                        <th className="py-2 pr-4">Type</th>
                        <th className="py-2 pr-4">Method</th>
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {list.data.items.map((item) => (
                        <tr key={`${item.source}-${item.id}`} className={item.status === 'ISSUED' ? '' : 'text-gray-400'}>
                          <td className="py-2 pr-4">{formatDate(item.issuedAt)}</td>
                          <td className="py-2 pr-4 font-mono text-xs">{item.receiptNumber}</td>
                          <td className="py-2 pr-4">{item.sectionName ?? item.fundName ?? '—'}</td>
                          <td className="py-2 pr-4">{titleCase(item.incomeType)}</td>
                          <td className="py-2 pr-4">{titleCase(item.paymentMethod)}</td>
                          <td className="py-2 pr-4">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[item.status]}`}>
                              {titleCase(item.status)}
                            </span>
                          </td>
                          <td className={`py-2 text-right font-medium ${item.status === 'ISSUED' ? 'text-gray-900' : 'line-through'}`}>
                            {formatMoney(item.amount, item.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPage={setPage} />
              </>
            ))}
        </section>
      </div>
    </MainLayout>
  );
};

export default MyGivingPage;
