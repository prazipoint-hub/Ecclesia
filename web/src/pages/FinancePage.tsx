import { useCallback, useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, RefreshCw, WalletCards } from 'lucide-react';
import { MainLayout } from '@/components/Layout/MainLayout';
import { useAuthStore } from '@/stores/authStore';
import { apiClient } from '@/utils/api';

interface FinanceDashboard {
  summary: {
    totalIncome: number;
    totalExpenditure: number;
    currentBalance: number;
    currency?: string;
  };
  recentReceipts: Array<{
    id: string;
    receiptNumber: string;
    amount: number;
    currency: string;
    recordedAt: string;
  }>;
  pendingExpenditures: Array<{ id: string; purpose: string; amount: number; status: string }>;
}

const errorMessage = (error: unknown) => {
  if (typeof error === 'object' && error && 'response' in error)
    return (
      (error as { response?: { data?: { error?: string } } }).response?.data?.error ??
      'Finance data could not be loaded.'
    );
  return 'Finance data could not be loaded.';
};

const amount = (value: number, currency = 'USD') =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);

export const FinancePage = () => {
  const { user } = useAuthStore();
  const [dashboard, setDashboard] = useState<FinanceDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!user?.churchId) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<FinanceDashboard>(
        `/api/v2/churches/${user.churchId}/dashboard`
      );
      setDashboard(data);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [user?.churchId]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);
  const currency = dashboard?.summary.currency ?? 'USD';

  return (
    <MainLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary-600">
              Church finance
            </p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">Finance dashboard</h1>
            <p className="mt-2 text-gray-600">
              Live receipts, expenditure approvals, and current balance.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadDashboard()}
            disabled={isLoading || !user?.churchId}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
        {!user?.churchId ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
            Assign this account to a church workspace before using finance.
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void loadDashboard()}
              className="mt-3 font-semibold underline"
            >
              Try again
            </button>
          </div>
        ) : isLoading && !dashboard ? (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-500">
            Loading finance dashboard…
          </div>
        ) : (
          dashboard && (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <Metric
                  label="Current balance"
                  value={amount(dashboard.summary.currentBalance, currency)}
                  icon={WalletCards}
                  tone="bg-primary-50 text-primary-700"
                />
                <Metric
                  label="Income"
                  value={amount(dashboard.summary.totalIncome, currency)}
                  icon={ArrowDownRight}
                  tone="bg-emerald-50 text-emerald-700"
                />
                <Metric
                  label="Expenditure"
                  value={amount(dashboard.summary.totalExpenditure, currency)}
                  icon={ArrowUpRight}
                  tone="bg-amber-50 text-amber-700"
                />
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-semibold text-gray-900">Recent receipts</h2>
                  <div className="mt-4 space-y-3">
                    {dashboard.recentReceipts.length ? (
                      dashboard.recentReceipts.map((receipt) => (
                        <div
                          key={receipt.id}
                          className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-3"
                        >
                          <div>
                            <p className="font-medium text-gray-900">{receipt.receiptNumber}</p>
                            <p className="text-sm text-gray-500">
                              {new Date(receipt.recordedAt).toLocaleDateString()}
                            </p>
                          </div>
                          <span className="font-semibold text-emerald-700">
                            {amount(receipt.amount, receipt.currency)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="py-4 text-sm text-gray-500">No receipts recorded yet.</p>
                    )}
                  </div>
                </section>
                <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-semibold text-gray-900">Pending expenditure</h2>
                  <div className="mt-4 space-y-3">
                    {dashboard.pendingExpenditures.length ? (
                      dashboard.pendingExpenditures.map((expenditure) => (
                        <div
                          key={expenditure.id}
                          className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-3"
                        >
                          <div>
                            <p className="font-medium text-gray-900">{expenditure.purpose}</p>
                            <p className="text-sm text-gray-500">{expenditure.status}</p>
                          </div>
                          <span className="font-semibold text-gray-900">
                            {amount(expenditure.amount, currency)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="py-4 text-sm text-gray-500">
                        No expenditure approvals are waiting.
                      </p>
                    )}
                  </div>
                </section>
              </div>
            </>
          )
        )}
      </div>
    </MainLayout>
  );
};

const Metric = ({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof WalletCards;
  tone: string;
}) => (
  <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="mt-3 text-2xl font-bold text-gray-900">{value}</p>
      </div>
      <span className={`rounded-lg p-2 ${tone}`}>
        <Icon className="h-5 w-5" />
      </span>
    </div>
  </div>
);
