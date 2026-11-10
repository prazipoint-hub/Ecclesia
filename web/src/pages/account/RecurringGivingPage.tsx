import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { FormSelect } from '@/components/forms/FormSelect';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  INCOME_TYPE_OPTIONS,
  validateAmount,
  validatePhone,
  type GivingFund,
  type IncomeType,
  type RecurringFrequency,
  type RecurringView,
} from '@/types/giving';
import { EmptyBlock, ErrorBlock, LoadingBlock, PageHeader, card, formatDate, formatMoney, primaryBtn, secondaryBtn, titleCase } from './shared';

const RECURRING_KEY = ['giving', 'recurring'];

const NewRecurringForm = ({ onDone }: { onDone: () => void }) => {
  const queryClient = useQueryClient();
  const [fundId, setFundId] = useState('');
  const [amount, setAmount] = useState('');
  const [incomeType, setIncomeType] = useState<IncomeType>('OFFERING');
  const [frequency, setFrequency] = useState<RecurringFrequency>('MONTHLY');
  const [method, setMethod] = useState<'ECOCASH' | 'ONEMONEY'>('ECOCASH');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<Partial<Record<'amount' | 'phone', string>>>({});

  const funds = useQuery({
    queryKey: ['giving', 'funds'],
    queryFn: async () => (await apiClient.get<GivingFund[]>('/api/v2/payments/funds')).data,
  });
  const create = useMutation({
    mutationFn: async () =>
      apiClient.post('/api/v2/recurring-giving', {
        fundId: fundId || funds.data?.[0]?.id,
        amount: Number(amount),
        incomeType,
        frequency,
        method,
        phone: phone.trim(),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RECURRING_KEY });
      onDone();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: typeof errors = {};
    const amountError = validateAmount(amount);
    if (amountError) next.amount = amountError;
    const phoneError = validatePhone(phone);
    if (phoneError) next.phone = phoneError;
    setErrors(next);
    if (Object.keys(next).length === 0) create.mutate();
  };

  return (
    <form onSubmit={submit} noValidate className={`${card} space-y-4`} aria-label="New recurring gift">
      {create.isError && <ErrorNotice message={getApiErrorMessage(create.error, 'Recurring giving could not be set up.')} />}
      <FormSelect
        label="Fund"
        value={fundId || funds.data?.[0]?.id || ''}
        options={(funds.data ?? []).map((f) => ({ value: f.id, label: f.name }))}
        onChange={(e) => setFundId(e.target.value)}
      />
      <FormSelect label="Type" value={incomeType} options={INCOME_TYPE_OPTIONS} onChange={(e) => setIncomeType(e.target.value as IncomeType)} />
      <FormField label="Amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} error={errors.amount} placeholder="0.00" />
      <FormSelect
        label="How often"
        value={frequency}
        options={[{ value: 'WEEKLY', label: 'Every week' }, { value: 'MONTHLY', label: 'Every month' }]}
        onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
      />
      <FormSelect
        label="Pay with"
        value={method}
        options={[{ value: 'ECOCASH', label: 'EcoCash' }, { value: 'ONEMONEY', label: 'OneMoney' }]}
        onChange={(e) => setMethod(e.target.value as 'ECOCASH' | 'ONEMONEY')}
      />
      <FormField
        label="Mobile money number"
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        error={errors.phone}
        placeholder="0771234567"
        hint="Each time a gift is due you will get a prompt on this phone to approve it."
      />
      <div className="flex gap-3">
        <button type="submit" className={primaryBtn} disabled={create.isPending || !funds.data?.length}>
          {create.isPending ? 'Saving…' : 'Start recurring gift'}
        </button>
        <button type="button" className={secondaryBtn} onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
};

export const RecurringGivingPage = () => {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const recurring = useQuery({
    queryKey: RECURRING_KEY,
    queryFn: async () => (await apiClient.get<RecurringView[]>('/api/v2/recurring-giving')).data,
  });
  const toggle = useMutation({
    mutationFn: async (item: RecurringView) => apiClient.put(`/api/v2/recurring-giving/${item.id}/${item.isActive ? 'pause' : 'resume'}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RECURRING_KEY }),
  });

  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader
          title="Recurring giving"
          subtitle="Give on a schedule. You approve each gift on your phone."
          action={!creating && <button type="button" className={primaryBtn} onClick={() => setCreating(true)}>New recurring gift</button>}
        />

        {creating && <NewRecurringForm onDone={() => setCreating(false)} />}
        {toggle.isError && <ErrorNotice message={getApiErrorMessage(toggle.error, 'The change could not be saved.')} />}
        {recurring.isLoading && <LoadingBlock />}
        {recurring.isError && <ErrorBlock error={recurring.error} onRetry={() => recurring.refetch()} />}

        {recurring.data &&
          (recurring.data.length === 0 ? (
            <EmptyBlock message="You have no recurring gifts." />
          ) : (
            <ul className="space-y-4">
              {recurring.data.map((item) => (
                <li key={item.id} className={`${card} flex flex-wrap items-center justify-between gap-4`}>
                  <div>
                    <p className="font-medium text-gray-900">
                      {formatMoney(item.amount, item.currency)} {item.frequency === 'WEEKLY' ? 'every week' : 'every month'}
                    </p>
                    <p className="text-sm text-gray-500">
                      {item.fundName} · {titleCase(item.incomeType)} · {titleCase(item.method)} {item.phone}
                    </p>
                    <p className="text-sm text-gray-500">
                      {item.isActive ? `Next gift: ${formatDate(item.nextChargeDate)}` : 'Paused'}
                    </p>
                  </div>
                  <button type="button" className={secondaryBtn} disabled={toggle.isPending} onClick={() => toggle.mutate(item)}>
                    {item.isActive ? 'Pause' : 'Resume'}
                  </button>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </MainLayout>
  );
};

export default RecurringGivingPage;
