import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { MainLayout } from '@/components/Layout/MainLayout';
import { ErrorBlock, LoadingBlock, card, formatDate, formatMoney, primaryBtn, secondaryBtn, titleCase } from '@/pages/account/shared';
import { apiClient } from '@/utils/api';
import type { PaymentView } from '@/types/giving';

export const POLL_INTERVAL_MS = 3000;
export const POLL_TIMEOUT_MS = 10 * 60 * 1000;

export const GiveConfirmPage = ({ pollMs = POLL_INTERVAL_MS }: { pollMs?: number }) => {
  const [params] = useSearchParams();
  const paymentId = params.get('paymentId');
  const startedAt = useRef(Date.now());

  const payment = useQuery({
    queryKey: ['giving', 'payment', paymentId],
    enabled: Boolean(paymentId),
    queryFn: async () => (await apiClient.get<PaymentView>(`/api/v2/payments/${encodeURIComponent(paymentId!)}`)).data,
    refetchInterval: (query) =>
      query.state.data?.status === 'PENDING' && Date.now() - startedAt.current < POLL_TIMEOUT_MS ? pollMs : false,
  });

  const data = payment.data;
  const timedOut = data?.status === 'PENDING' && Date.now() - startedAt.current >= POLL_TIMEOUT_MS;

  return (
    <MainLayout>
      <div className="mx-auto max-w-xl space-y-7">
        <div><p className="page-eyebrow">Giving</p><h1 className="mt-2 text-2xl font-medium text-gray-950 sm:text-2xl">Your gift</h1><p className="mt-2 text-gray-600">Track the status and details of your contribution.</p></div>

        {!paymentId && (
          <div role="alert" className={card}>
            <p className="text-gray-700">We could not find a payment to show.</p>
            <Link to="/give" className={`${primaryBtn} mt-4 inline-block`}>Back to giving</Link>
          </div>
        )}
        {paymentId && payment.isLoading && <LoadingBlock label="Checking your payment…" />}
        {paymentId && payment.isError && <ErrorBlock error={payment.error} onRetry={() => payment.refetch()} />}

        {data && (
          <section className={`${card} space-y-5 overflow-hidden text-center`} aria-live="polite">
            {data.status === 'PENDING' && !timedOut && (
              <>
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-lg bg-primary-50"><Loader2 className="h-8 w-8 animate-spin text-primary-600" /></span>
                <h2 className="text-xl font-medium text-gray-900">Waiting for your payment</h2>
                <p className="text-gray-600">{data.instructions ?? 'Approve the prompt on your phone to complete your gift.'}</p>
                {data.redirectUrl && (
                  <a href={data.redirectUrl} className={`${primaryBtn} inline-block`}>
                    Continue to payment page
                  </a>
                )}
              </>
            )}
            {data.status === 'PENDING' && timedOut && (
              <>
                <h2 className="text-xl font-medium text-gray-900">Still waiting</h2>
                <p className="text-gray-600">We have not heard back yet. You can check again later from your giving history.</p>
              </>
            )}
            {data.status === 'COMPLETED' && (
              <>
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-lg bg-green-50"><CheckCircle className="h-9 w-9 text-green-600" /></span>
                <h2 className="text-xl font-medium text-gray-900">Thank you!</h2>
                <p className="text-gray-600">Your gift was received.</p>
              </>
            )}
            {(data.status === 'FAILED' || data.status === 'CANCELLED') && (
              <>
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-lg bg-red-50"><XCircle className="h-9 w-9 text-red-600" /></span>
                <h2 className="text-xl font-medium text-gray-900">Payment {data.status === 'CANCELLED' ? 'cancelled' : 'failed'}</h2>
                <p className="text-gray-600">{data.failureReason ?? 'The payment was not completed. You have not been charged.'}</p>
              </>
            )}

            <dl className="divide-y divide-gray-100 rounded-md bg-gray-50/70 px-4 text-left text-sm">
              <div className="flex justify-between py-2"><dt className="text-gray-500">Amount</dt><dd className="font-medium">{formatMoney(data.amount, data.currency)}</dd></div>
              <div className="flex justify-between py-2"><dt className="text-gray-500">Fund</dt><dd>{data.fundName}</dd></div>
              <div className="flex justify-between py-2"><dt className="text-gray-500">Type</dt><dd>{titleCase(data.incomeType)}</dd></div>
              <div className="flex justify-between py-2"><dt className="text-gray-500">Reference</dt><dd className="font-mono text-xs">{data.reference}</dd></div>
              {data.receiptNumber && (
                <div className="flex justify-between py-2"><dt className="text-gray-500">Receipt</dt><dd className="font-mono text-xs">{data.receiptNumber}</dd></div>
              )}
              {data.paidAt && <div className="flex justify-between py-2"><dt className="text-gray-500">Paid</dt><dd>{formatDate(data.paidAt)}</dd></div>}
            </dl>

            <div className="flex flex-wrap justify-center gap-3">
              {(data.status === 'FAILED' || data.status === 'CANCELLED') && <Link to="/give" className={primaryBtn}>Try again</Link>}
              <Link to="/my-account/giving" className={secondaryBtn}>View giving history</Link>
            </div>
          </section>
        )}
      </div>
    </MainLayout>
  );
};

export default GiveConfirmPage;
