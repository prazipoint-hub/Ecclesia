import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Church, HeartHandshake, UsersRound } from 'lucide-react';
import { ErrorBlock, LoadingBlock, formatDate, formatMoney } from '@/pages/account/shared';
import { apiClient } from '@/utils/api';
import type { PublicCampaign } from '@/types/advanced';
import { ProgressBar } from './shared';

/** No sign-in and no app chrome: this is the page people are sent to from a message or a printed flyer. */
export const PublicCampaignPage = () => {
  const { slug = '' } = useParams();
  const campaign = useQuery({
    queryKey: ['public-campaign', slug],
    retry: false,
    queryFn: async () =>
      (await apiClient.get<PublicCampaign>(`/api/v2/public/campaigns/${encodeURIComponent(slug)}`))
        .data,
  });
  const c = campaign.data;
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#faf8fc] px-4 py-10 sm:px-6">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-72 bg-primary-950" />
      <div className="relative mx-auto max-w-2xl">
        <div className="mb-7 flex items-center justify-center gap-3 text-white">
          <span className="rounded-xl bg-white/10 p-2.5 text-amber-300 ring-1 ring-white/15">
            <Church className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display font-semibold">Ecclesia</p>
            <p className="text-xs text-primary-200">Community giving</p>
          </div>
        </div>
        {campaign.isLoading && <LoadingBlock label="Loading campaign…" />}
        {campaign.isError && (
          <div className="space-y-3 rounded-2xl bg-white p-5 shadow-lift">
            <ErrorBlock error={campaign.error} />
            <p className="text-sm text-gray-600">This campaign may have ended or is not public.</p>
          </div>
        )}
        {c && (
          <article className="overflow-hidden rounded-3xl border border-white/50 bg-white shadow-lift">
            <div className="bg-gradient-to-br from-primary-900 to-primary-700 p-6 text-white sm:p-8">
              <span className="inline-flex rounded-2xl bg-white/10 p-3 text-amber-300 ring-1 ring-white/15">
                <HeartHandshake className="h-7 w-7" />
              </span>
              <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-primary-200">
                Giving campaign
              </p>
              <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">{c.name}</h1>
              {c.description && (
                <p className="mt-3 whitespace-pre-line leading-relaxed text-primary-100">
                  {c.description}
                </p>
              )}
            </div>
            <div className="space-y-5 p-6 sm:p-8">
              <ProgressBar percent={c.percent} label="Campaign progress" />
              <p className="text-2xl font-semibold text-gray-950">
                {formatMoney(c.raised, 'USD')}{' '}
                <span className="block text-sm font-normal text-gray-600 sm:inline">
                  raised of {formatMoney(c.goalAmount, 'USD')} ({c.percent}%)
                </span>
              </p>
              <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5">
                  <UsersRound className="h-4 w-4" /> {c.donors} donor{c.donors === 1 ? '' : 's'}
                </span>
                {c.daysLeft !== null && (
                  <span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-800">
                    {c.daysLeft} day(s) left
                  </span>
                )}
                <span className="rounded-full bg-gray-100 px-3 py-1.5">
                  Started {formatDate(c.startDate)}
                </span>
              </div>
              <Link
                to={`/give?fundId=${encodeURIComponent(c.fundId)}`}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-3 font-semibold text-white shadow-sm hover:bg-primary-700 hover:shadow-md"
              >
                Give <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="text-center text-xs text-gray-500">
                You will be asked to sign in before giving.
              </p>
            </div>
          </article>
        )}
      </div>
    </main>
  );
};
export default PublicCampaignPage;
