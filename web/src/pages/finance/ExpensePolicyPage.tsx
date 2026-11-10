import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { ErrorBlock, LoadingBlock, card, primaryBtn } from '@/pages/account/shared';
import { AdminHeader, NoAccess } from '@/pages/admin/adminShared';
import { SuccessNotice } from '@/pages/auth/AuthShell';
import { apiClient } from '@/utils/api';
import { ApiError, FinanceNav, usePermissions } from './financeShared';

const URL = '/api/v2/accounting/expenditure-policy';
interface Policy { dualApprovalThreshold: number | null; payerNotApprover: boolean }

export const ExpensePolicyPage = () => {
  const has = usePermissions();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['expense-policy'], enabled: has('finance:view'), queryFn: async () => (await apiClient.get<Policy>(URL)).data });
  const [threshold, setThreshold] = useState('');
  const [payer, setPayer] = useState(false);
  useEffect(() => { if (q.data) { setThreshold(q.data.dualApprovalThreshold === null ? '' : String(q.data.dualApprovalThreshold)); setPayer(q.data.payerNotApprover); } }, [q.data]);
  const save = useMutation({
    mutationFn: () => apiClient.put(URL, { dualApprovalThreshold: threshold.trim() === '' ? null : Number(threshold), payerNotApprover: payer }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['expense-policy'] }),
  });
  const bad = threshold.trim() !== '' && !(Number(threshold) > 0);
  return (
    <MainLayout>
      <div className="space-y-6">
        <AdminHeader title="Spending approval rules" subtitle="Applies to church, section, circuit and district expenditures. Nobody can approve or pay their own request, whatever is set here." />
        <FinanceNav />
        {!has('finance:view') ? <NoAccess permission="finance:view" /> : q.isLoading ? <LoadingBlock /> : q.error ? <ErrorBlock error={q.error} /> : (
          <section className={`${card} space-y-4`}>
            {save.error && <ApiError error={save.error} />}
            {save.isSuccess && <SuccessNotice message="Saved. It applies to approvals made from now on." />}
            <FormField type="number" min="0" step="0.01" label="Two different approvers are needed at or above this amount (leave empty for one approver)" value={threshold} disabled={!has('finance:policy:manage')} onChange={(e) => setThreshold(e.target.value)} />
            <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={payer} disabled={!has('finance:policy:manage')} onChange={(e) => setPayer(e.target.checked)} />The person who records a payment may not be one of the approvers</label>
            {has('finance:policy:manage') ? <button type="button" className={primaryBtn} disabled={bad || save.isPending} onClick={() => save.mutate()}>Save rules</button> : <p className="text-sm text-gray-500">You can view these rules. Changing them needs finance:policy:manage.</p>}
          </section>
        )}
      </div>
    </MainLayout>
  );
};
