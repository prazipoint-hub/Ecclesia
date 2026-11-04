import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
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
    queryFn: async () => (await apiClient.get<PublicCampaign>(`/api/v2/public/campaigns/${encodeURIComponent(slug)}`)).data,
  });
  const c = campaign.data;
  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-12">
      {campaign.isLoading && <LoadingBlock />}
      {campaign.isError && (
        <div className="space-y-3">
          <ErrorBlock error={campaign.error} />
          <p className="text-sm text-gray-600">This campaign may have ended or is not public.</p>
        </div>
      )}
      {c && (
        <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-bold text-gray-900">{c.name}</h1>
          {c.description && <p className="whitespace-pre-line text-gray-700">{c.description}</p>}
          <ProgressBar percent={c.percent} label="Campaign progress" />
          <p className="text-lg font-semibold text-gray-900">{formatMoney(c.raised, 'USD')} <span className="text-sm font-normal text-gray-600">raised of {formatMoney(c.goalAmount, 'USD')} ({c.percent}%)</span></p>
          <p className="text-sm text-gray-600">{c.donors} donor(s){c.daysLeft !== null ? ` · ${c.daysLeft} day(s) left` : ''} · Started {formatDate(c.startDate)}</p>
          <Link to={`/give?fundId=${encodeURIComponent(c.fundId)}`} className="inline-block rounded-lg bg-primary-600 px-5 py-3 text-sm font-semibold text-white hover:bg-primary-700">Give</Link>
          <p className="text-xs text-gray-500">You will be asked to sign in before giving.</p>
        </div>
      )}
    </main>
  );
};
export default PublicCampaignPage;
