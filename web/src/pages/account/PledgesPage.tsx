import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { FormSelect } from '@/components/forms/FormSelect';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import { validateAmount, type GivingFund, type PledgeList, type PledgeView } from '@/types/giving';
import { EmptyBlock, ErrorBlock, LoadingBlock, PageHeader, Pagination, card, formatDate, formatMoney, primaryBtn, secondaryBtn, titleCase } from './shared';

const PAGE_SIZE = 10;
const PLEDGES_KEY = ['giving', 'pledges'];

const STATUS_STYLES: Record<PledgeView['status'], string> = {
  ACTIVE: 'bg-blue-100 text-blue-700',
  FULFILLED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-200 text-gray-700',
};

export const PledgeProgress = ({ pledge }: { pledge: PledgeView }) => {
  const percent = pledge.targetAmount > 0 ? Math.min(100, Math.round((pledge.paidAmount / pledge.targetAmount) * 100)) : 0;
  return (
    <div>
      <div
        role="progressbar"
        aria-label={`${pledge.name} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 w-full overflow-hidden rounded-full bg-gray-200"
      >
        <div className="h-full rounded-full bg-primary-500" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1 text-xs text-gray-500">
        {formatMoney(pledge.paidAmount, pledge.currency)} of {formatMoney(pledge.targetAmount, pledge.currency)} ({percent}%)
      </p>
    </div>
  );
};

const NewPledgeForm = ({ onDone }: { onDone: () => void }) => {
  const queryClient = useQueryClient();
  const [fundId, setFundId] = useState('');
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [endDate, setEndDate] = useState('');
  const [errors, setErrors] = useState<Partial<Record<'name' | 'target', string>>>({});

  const funds = useQuery({
    queryKey: ['giving', 'funds'],
    queryFn: async () => (await apiClient.get<GivingFund[]>('/api/v2/payments/funds')).data,
  });
  const create = useMutation({
    mutationFn: async () =>
      apiClient.post('/api/v2/pledges', {
        fundId: fundId || funds.data?.[0]?.id,
        name: name.trim(),
        targetAmount: Number(target),
        ...(endDate && { endDate }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PLEDGES_KEY });
      onDone();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: typeof errors = {};
    if (!name.trim()) next.name = 'Give your pledge a name.';
    const targetError = validateAmount(target);
    if (targetError) next.target = targetError;
    setErrors(next);
    if (Object.keys(next).length === 0) create.mutate();
  };

  return (
    <form onSubmit={submit} noValidate className={`${card} space-y-4`} aria-label="New pledge">
      {create.isError && <ErrorNotice message={getApiErrorMessage(create.error, 'The pledge could not be created.')} />}
      {funds.isError && <ErrorNotice message={getApiErrorMessage(funds.error)} />}
      <FormField label="Pledge name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder="Building fund 2026" />
      <FormSelect
        label="Fund"
        value={fundId || funds.data?.[0]?.id || ''}
        options={(funds.data ?? []).map((f) => ({ value: f.id, label: f.name }))}
        onChange={(e) => setFundId(e.target.value)}
      />
      <FormField label="Target amount" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} error={errors.target} placeholder="0.00" />
      <FormField label="Finish by (optional)" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      <div className="flex gap-3">
        <button type="submit" className={primaryBtn} disabled={create.isPending || !funds.data?.length}>
          {create.isPending ? 'Saving…' : 'Create pledge'}
        </button>
        <button type="button" className={secondaryBtn} onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
};

export const PledgesPage = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const pledges = useQuery({
    queryKey: [...PLEDGES_KEY, page],
    queryFn: async () => (await apiClient.get<PledgeList>('/api/v2/pledges', { params: { page, pageSize: PAGE_SIZE } })).data,
    placeholderData: (previous) => previous,
  });
  const cancel = useMutation({
    mutationFn: async (id: string) => apiClient.put(`/api/v2/pledges/${id}/cancel`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PLEDGES_KEY }),
  });

  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader
          title="My pledges"
          subtitle="Commit to a goal and track your progress as you give."
          action={!creating && <button type="button" className={primaryBtn} onClick={() => setCreating(true)}>New pledge</button>}
        />

        {creating && <NewPledgeForm onDone={() => setCreating(false)} />}
        {cancel.isError && <ErrorNotice message={getApiErrorMessage(cancel.error, 'The pledge could not be cancelled.')} />}
        {pledges.isLoading && <LoadingBlock />}
        {pledges.isError && <ErrorBlock error={pledges.error} onRetry={() => pledges.refetch()} />}

        {pledges.data &&
          (pledges.data.items.length === 0 ? (
            <EmptyBlock message="You have no pledges yet." />
          ) : (
            <>
              <ul className="space-y-4">
                {pledges.data.items.map((pledge) => (
                  <li key={pledge.id} className={`${card} space-y-3`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h2 className="font-semibold text-gray-900">{pledge.name}</h2>
                        <p className="text-sm text-gray-500">
                          {pledge.fundName} · since {formatDate(pledge.startDate)}
                          {pledge.endDate && ` · by ${formatDate(pledge.endDate)}`}
                        </p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[pledge.status]}`}>{titleCase(pledge.status)}</span>
                    </div>
                    <PledgeProgress pledge={pledge} />
                    {pledge.status === 'ACTIVE' && (
                      <div className="flex gap-3">
                        <Link to={`/give?pledgeId=${encodeURIComponent(pledge.id)}`} className={primaryBtn}>Give toward this</Link>
                        <button
                          type="button"
                          className={secondaryBtn}
                          disabled={cancel.isPending}
                          onClick={() => window.confirm(`Cancel the pledge "${pledge.name}"?`) && cancel.mutate(pledge.id)}
                        >
                          Cancel pledge
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <Pagination page={page} pageSize={PAGE_SIZE} total={pledges.data.total} onPage={setPage} />
            </>
          ))}
      </div>
    </MainLayout>
  );
};

export default PledgesPage;
