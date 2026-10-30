import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/Layout/MainLayout';
import { FormField } from '@/components/forms/FormField';
import { FormSelect } from '@/components/forms/FormSelect';
import { Modal } from '@/components/forms/Modal';
import { EmptyBlock, ErrorBlock, LoadingBlock, card, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { AdminHeader, NoAccess } from '@/pages/admin/adminShared';
import { apiClient } from '@/utils/api';
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS } from '@/types/accounting';
import type { AccountLedger, AccountType, LedgerAccount } from '@/types/accounting';
import { ACCOUNTS_KEY, useAccounts } from './financeQueries';
import { ApiError, FinanceNav, money, num, statusBadge, td, th, today, toDateInput, usePermissions } from './financeShared';

const AccountForm = ({ onDone }: { onDone: () => void }) => {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({ code: '', name: '', type: 'EXPENSE' as AccountType, description: '' });
  const create = useMutation({
    mutationFn: () =>
      apiClient.post('/api/v2/accounting/accounts', { code: draft.code.trim(), name: draft.name.trim(), type: draft.type, ...(draft.description.trim() && { description: draft.description.trim() }) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY });
      onDone();
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (draft.code.trim() && draft.name.trim()) create.mutate();
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      {create.error && <ApiError error={create.error} />}
      <FormField label="Code" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} required />
      <FormField label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
      <FormSelect label="Type" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as AccountType })} options={ACCOUNT_TYPES.map((t) => ({ value: t, label: ACCOUNT_TYPE_LABELS[t] }))} />
      <FormField label="Description (optional)" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
      <div className="flex justify-end gap-2">
        <button type="button" className={secondaryBtn} onClick={onDone}>Cancel</button>
        <button type="submit" className={primaryBtn} disabled={create.isPending}>{create.isPending ? 'Saving…' : 'Add account'}</button>
      </div>
    </form>
  );
};

const LedgerView = ({ account }: { account: LedgerAccount }) => {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const ledger = useQuery({
    queryKey: ['accounting', 'ledger', account.id, from, to],
    queryFn: async () => (await apiClient.get<AccountLedger>(`/api/v2/accounting/accounts/${account.id}/ledger`, { params: { ...(from && { from }), ...(to && { to }) } })).data,
  });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FormField type="date" label="From" value={from} onChange={(e) => setFrom(e.target.value)} />
        <FormField type="date" label="To" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      {ledger.isLoading && <LoadingBlock />}
      {ledger.error && <ErrorBlock error={ledger.error} onRetry={() => void ledger.refetch()} />}
      {ledger.data && (
        <div className="max-h-96 overflow-auto">
          <p className="mb-2 text-sm text-gray-600">Opening balance: <strong>{money(ledger.data.openingBalance)}</strong></p>
          <table className="min-w-full divide-y divide-gray-200">
            <thead><tr><th className={th}>Date</th><th className={th}>Entry</th><th className={`${th} text-right`}>Debit</th><th className={`${th} text-right`}>Credit</th><th className={`${th} text-right`}>Balance</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {ledger.data.items.map((row, i) => (
                <tr key={`${row.entryId}-${i}`}>
                  <td className={td}>{toDateInput(row.postDate)}</td>
                  <td className={td}>{row.reference} — {row.description}</td>
                  <td className={num}>{row.debit ? money(row.debit) : ''}</td>
                  <td className={num}>{row.credit ? money(row.credit) : ''}</td>
                  <td className={num}>{money(row.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {ledger.data.truncated && <p className="mt-2 text-xs text-amber-700">Only the first 1000 lines are shown. Narrow the date range to see the rest.</p>}
          <p className="mt-2 text-sm text-gray-600">Closing balance: <strong>{money(ledger.data.closingBalance)}</strong></p>
        </div>
      )}
    </div>
  );
};

const OpeningBalancesForm = ({ accounts, onDone }: { accounts: LedgerAccount[]; onDone: () => void }) => {
  const queryClient = useQueryClient();
  const eligible = accounts.filter((a) => a.isActive && a.code !== '3100');
  const [asOf, setAsOf] = useState(today());
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () =>
      apiClient.post('/api/v2/accounting/opening-balances', {
        asOf,
        balances: Object.entries(amounts).filter(([, v]) => Number(v) > 0).map(([accountId, v]) => ({ accountId, amount: Number(v) })),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY });
      void queryClient.invalidateQueries({ queryKey: ['accounting', 'journals'] });
      onDone();
    },
  });
  const entered = Object.values(amounts).filter((v) => Number(v) > 0).length;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (entered > 0) save.mutate(); }} className="space-y-3">
      <p className="text-sm text-gray-600">Enter the natural balance of each account as at the start date. The difference is posted to Opening Balance Equity (3100).</p>
      {save.error && <ApiError error={save.error} />}
      <FormField type="date" label="As of" value={asOf} onChange={(e) => setAsOf(e.target.value)} required />
      <div className="max-h-72 space-y-2 overflow-auto">
        {eligible.map((a) => (
          <FormField key={a.id} type="number" min="0" step="0.01" label={`${a.code} ${a.name}`} value={amounts[a.id] ?? ''} onChange={(e) => setAmounts({ ...amounts, [a.id]: e.target.value })} />
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className={secondaryBtn} onClick={onDone}>Cancel</button>
        <button type="submit" className={primaryBtn} disabled={save.isPending || entered === 0}>{save.isPending ? 'Posting…' : 'Post opening balances'}</button>
      </div>
    </form>
  );
};

export const AccountsPage = () => {
  const has = usePermissions();
  const queryClient = useQueryClient();
  const accounts = useAccounts();
  const [adding, setAdding] = useState(false);
  const [opening, setOpening] = useState(false);
  const [viewing, setViewing] = useState<LedgerAccount | null>(null);

  const seed = useMutation({
    mutationFn: () => apiClient.post('/api/v2/accounting/accounts/seed-default'),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY }),
  });
  const toggle = useMutation({
    mutationFn: (a: LedgerAccount) => apiClient.put(`/api/v2/accounting/accounts/${a.id}`, { isActive: !a.isActive }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY }),
  });

  const canManage = has('finance:coa:manage');
  const grouped = ACCOUNT_TYPES.map((type) => ({ type, rows: (accounts.data ?? []).filter((a) => a.type === type) })).filter((g) => g.rows.length > 0);

  return (
    <MainLayout>
      <div className="space-y-6">
        <AdminHeader
          title="Chart of accounts"
          subtitle="The ledger accounts every journal entry is posted to."
          action={
            <div className="flex gap-2">
              {has('finance:opening:set') && <button type="button" className={secondaryBtn} onClick={() => setOpening(true)}>Opening balances</button>}
              {canManage && <button type="button" className={primaryBtn} onClick={() => setAdding(true)}>Add account</button>}
            </div>
          }
        />
        <FinanceNav />
        {!has('finance:view') ? (
          <NoAccess permission="finance:view" />
        ) : accounts.isLoading ? (
          <LoadingBlock />
        ) : accounts.error ? (
          <ErrorBlock error={accounts.error} onRetry={() => void accounts.refetch()} />
        ) : accounts.data && accounts.data.length === 0 ? (
          <div className={card}>
            <EmptyBlock message="No accounts yet." />
            {canManage && (
              <div className="mt-3 space-y-2">
                {seed.error && <ApiError error={seed.error} />}
                <button type="button" className={primaryBtn} disabled={seed.isPending} onClick={() => seed.mutate()}>
                  {seed.isPending ? 'Adding…' : 'Add default chart of accounts'}
                </button>
              </div>
            )}
          </div>
        ) : (
          grouped.map((group) => (
            <section key={group.type} className={card}>
              <h2 className="mb-2 text-lg font-semibold text-gray-900">{ACCOUNT_TYPE_LABELS[group.type]}</h2>
              <table className="min-w-full divide-y divide-gray-200">
                <thead><tr><th className={th}>Code</th><th className={th}>Name</th><th className={`${th} text-right`}>Balance</th><th className={th}>Status</th><th className={th} /></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {group.rows.map((a) => (
                    <tr key={a.id}>
                      <td className={td}>{a.code}</td>
                      <td className={td}>{a.name}</td>
                      <td className={num}>{money(a.balance)}</td>
                      <td className={td}>{a.isActive ? <span className={statusBadge('POSTED')}>Active</span> : <span className={statusBadge('DRAFT')}>Inactive</span>}</td>
                      <td className={`${td} space-x-3 text-right`}>
                        <button type="button" className="font-medium text-primary-600 hover:underline" onClick={() => setViewing(a)} aria-label={`View ledger for ${a.name}`}>Ledger</button>
                        {canManage && !a.isSystem && (
                          <button type="button" className="font-medium text-gray-600 hover:underline" disabled={toggle.isPending} onClick={() => toggle.mutate(a)}>
                            {a.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))
        )}
        {toggle.error && <ApiError error={toggle.error} />}
      </div>
      <Modal open={adding} title="Add account" onClose={() => setAdding(false)}><AccountForm onDone={() => setAdding(false)} /></Modal>
      <Modal open={opening} title="Opening balances" onClose={() => setOpening(false)}>
        <OpeningBalancesForm accounts={accounts.data ?? []} onDone={() => setOpening(false)} />
      </Modal>
      <Modal open={viewing !== null} title={viewing ? `${viewing.code} ${viewing.name}` : ''} onClose={() => setViewing(null)}>
        {viewing && <LedgerView account={viewing} />}
      </Modal>
    </MainLayout>
  );
};
