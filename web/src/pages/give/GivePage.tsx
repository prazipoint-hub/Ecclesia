import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { FormSelect } from '@/components/forms/FormSelect';
import { ErrorNotice } from '@/pages/auth/AuthShell';
import { ErrorBlock, LoadingBlock, PageHeader, card, formatMoney, primaryBtn } from '@/pages/account/shared';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  INCOME_TYPE_OPTIONS,
  validateAmount,
  validatePhone,
  type GivingFund,
  type IncomeType,
  type InitiatePaymentRequest,
  type PaymentMethod,
  type PaymentView,
  type PledgeList,
  type SavedMethod,
} from '@/types/giving';

const METHOD_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'ECOCASH', label: 'EcoCash' },
  { value: 'ONEMONEY', label: 'OneMoney' },
  { value: 'WEB', label: 'Card or other (Paynow checkout)' },
];

type Errors = Partial<Record<'fund' | 'amount' | 'phone', string>>;

export const GivePage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const presetPledge = params.get('pledgeId') ?? '';

  const [fundId, setFundId] = useState('');
  const [incomeType, setIncomeType] = useState<IncomeType>('OFFERING');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('ECOCASH');
  const [savedMethodId, setSavedMethodId] = useState('');
  const [phone, setPhone] = useState('');
  const [pledgeId, setPledgeId] = useState(presetPledge);
  const [errors, setErrors] = useState<Errors>({});

  const funds = useQuery({
    queryKey: ['giving', 'funds'],
    queryFn: async () => (await apiClient.get<GivingFund[]>('/api/v2/payments/funds')).data,
  });
  const saved = useQuery({
    queryKey: ['giving', 'saved-methods'],
    queryFn: async () => (await apiClient.get<SavedMethod[]>('/api/v2/payment-methods')).data,
  });
  const pledges = useQuery({
    queryKey: ['giving', 'pledges', 'active'],
    queryFn: async () => (await apiClient.get<PledgeList>('/api/v2/pledges', { params: { page: 1, pageSize: 100 } })).data,
  });

  const activePledges = useMemo(() => (pledges.data?.items ?? []).filter((p) => p.status === 'ACTIVE'), [pledges.data]);
  const mobileSaved = useMemo(() => (saved.data ?? []).filter((m) => method !== 'WEB' && m.type === method), [saved.data, method]);
  const usingSaved = method !== 'WEB' && savedMethodId !== '' && mobileSaved.some((m) => m.id === savedMethodId);
  const selectedFund = funds.data?.find((f) => f.id === (fundId || funds.data[0]?.id));

  const pay = useMutation({
    mutationFn: async (body: InitiatePaymentRequest) => (await apiClient.post<PaymentView>('/api/v2/payments/initiate', body)).data,
    onSuccess: (payment) => navigate(`/give/confirm?paymentId=${encodeURIComponent(payment.id)}`),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const effectiveFund = fundId || funds.data?.[0]?.id || '';
    const next: Errors = {};
    if (!effectiveFund) next.fund = 'Choose a fund.';
    const amountError = validateAmount(amount);
    if (amountError) next.amount = amountError;
    if (method !== 'WEB' && !usingSaved) {
      const phoneError = validatePhone(phone);
      if (phoneError) next.phone = phoneError;
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    pay.mutate({
      fundId: effectiveFund,
      amount: Number(amount),
      incomeType,
      method,
      ...(method !== 'WEB' && (usingSaved ? { savedMethodId } : { phone: phone.trim() })),
      ...(pledgeId && { pledgeId }),
    });
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader title="Give" subtitle="Give your tithes and offerings securely from your phone." />

        {funds.isLoading && <LoadingBlock />}
        {funds.isError && <ErrorBlock error={funds.error} onRetry={() => funds.refetch()} />}

        {funds.data && (
          <form onSubmit={submit} noValidate className={`${card} space-y-4`} aria-label="Give">
            {pay.isError && <ErrorNotice message={getApiErrorMessage(pay.error, 'The payment could not be started.')} />}

            <FormSelect
              label="Fund"
              value={fundId || funds.data[0]?.id || ''}
              options={funds.data.map((f) => ({ value: f.id, label: f.name }))}
              onChange={(e) => setFundId(e.target.value)}
              error={errors.fund}
            />
            {selectedFund?.description && <p className="-mt-2 text-xs text-gray-500">{selectedFund.description}</p>}

            <FormSelect label="Type" value={incomeType} options={INCOME_TYPE_OPTIONS} onChange={(e) => setIncomeType(e.target.value as IncomeType)} />

            <FormField
              label="Amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              error={errors.amount}
            />

            <FormSelect
              label="Pay with"
              value={method}
              options={METHOD_OPTIONS}
              onChange={(e) => {
                setMethod(e.target.value as PaymentMethod);
                setSavedMethodId('');
              }}
            />

            {method !== 'WEB' && mobileSaved.length > 0 && (
              <FormSelect
                label="Saved number"
                value={savedMethodId}
                placeholder="Use a different number"
                options={mobileSaved.map((m) => ({ value: m.id, label: `${m.label} (${m.phoneMasked})` }))}
                onChange={(e) => setSavedMethodId(e.target.value)}
              />
            )}

            {method !== 'WEB' && !usingSaved && (
              <FormField
                label="Mobile money number"
                type="tel"
                placeholder="0771234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                error={errors.phone}
                hint="You will get a prompt on this phone to approve the payment."
              />
            )}

            {activePledges.length > 0 && (
              <FormSelect
                label="Toward a pledge (optional)"
                value={pledgeId}
                placeholder="Not toward a pledge"
                options={activePledges.map((p) => ({ value: p.id, label: `${p.name} - ${formatMoney(p.remainingAmount, p.currency)} remaining` }))}
                onChange={(e) => setPledgeId(e.target.value)}
              />
            )}

            <button type="submit" className={`${primaryBtn} w-full`} disabled={pay.isPending}>
              {pay.isPending ? 'Starting payment…' : 'Give'}
            </button>
            <p className="text-center text-xs text-gray-500">
              Want to give regularly? <Link to="/my-account/recurring" className="font-medium text-primary-600">Set up recurring giving</Link>
            </p>
          </form>
        )}
      </div>
    </MainLayout>
  );
};

export default GivePage;
