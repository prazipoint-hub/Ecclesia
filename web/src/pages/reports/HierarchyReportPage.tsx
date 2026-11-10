import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FormField } from '@/components/forms/FormField';
import { EmptyBlock, ErrorBlock, LoadingBlock, card, primaryBtn, secondaryBtn } from '@/pages/account/shared';
import { apiClient } from '@/utils/api';
import { today } from '@/pages/finance/financeShared';
import { R, Shell, label, td, th } from './reportsShared';

type Kind = 'MEMBERSHIP' | 'INCOME' | 'DEPOSITS' | 'ATTENDANCE';
type Unit = { key: string; scopeType: 'CONFERENCE' | 'DISTRICT' | 'CIRCUIT'; scopeId: string; name: string };
interface CircuitRow { id: string; name: string; district: { id: string; name: string } | null; conference: { id: string; name: string } | null }
interface Result { kind: Kind; scopeName: string; churchCount: number; truncated: boolean; generatedAt: string; rows: Array<Record<string, string | number>> }

const KINDS: Array<{ kind: Kind; text: string; hint: string; dates: boolean }> = [
  { kind: 'MEMBERSHIP', text: 'Active membership', hint: 'Distinct active members per church, today.', dates: false },
  { kind: 'INCOME', text: 'Income', hint: 'Issued church receipts per church, one total per currency. Circuit, district and section receipts are not included.', dates: true },
  { kind: 'DEPOSITS', text: 'Verified deposits', hint: 'Cash banked and verified per church, one total per currency.', dates: true },
  { kind: 'ATTENDANCE', text: 'Attendance', hint: 'Events held and people marked present per church.', dates: true },
];

const csv = (rows: Array<Record<string, string | number>>): string => {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v: unknown) => { const s = String(v ?? ''); return /^[=+\-@]/.test(s) ? `'${s}` : s; };
  const q = (v: unknown) => `"${cell(v).replace(/"/g, '""')}"`;
  return [cols.map(q).join(','), ...rows.map((r) => cols.map((c) => q(r[c])).join(','))].join('\n');
};

export const HierarchyReportPage = () => {
  const circuits = useQuery({ queryKey: ['hierarchy', 'circuits', 'units'], retry: false, queryFn: async () => (await apiClient.get<{ circuits: CircuitRow[] }>('/api/v2/hierarchy/circuits', { params: { take: 100 } })).data.circuits });
  const units = useMemo<Unit[]>(() => {
    const out = new Map<string, Unit>();
    for (const c of circuits.data ?? []) {
      if (c.conference) out.set(`CONFERENCE:${c.conference.id}`, { key: `CONFERENCE:${c.conference.id}`, scopeType: 'CONFERENCE', scopeId: c.conference.id, name: `${c.conference.name} (conference)` });
      if (c.district) out.set(`DISTRICT:${c.district.id}`, { key: `DISTRICT:${c.district.id}`, scopeType: 'DISTRICT', scopeId: c.district.id, name: `${c.district.name} (district)` });
      out.set(`CIRCUIT:${c.id}`, { key: `CIRCUIT:${c.id}`, scopeType: 'CIRCUIT', scopeId: c.id, name: `${c.name} (circuit)` });
    }
    return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [circuits.data]);

  const [unitKey, setUnitKey] = useState('');
  const [kind, setKind] = useState<Kind>('MEMBERSHIP');
  const [from, setFrom] = useState(`${new Date().getUTCFullYear()}-01-01`);
  const [to, setTo] = useState(today());
  const [params, setParams] = useState<Record<string, string> | null>(null);
  const meta = KINDS.find((k) => k.kind === kind)!;
  const unit = units.find((u) => u.key === (unitKey || units[0]?.key));

  const result = useQuery({
    queryKey: ['reports', 'hierarchy', params],
    enabled: params !== null,
    retry: false,
    queryFn: async () => (await apiClient.get<Result>(`${R}/hierarchy`, { params })).data,
  });
  const run = () => { if (unit) setParams({ kind, scopeType: unit.scopeType, scopeId: unit.scopeId, ...(meta.dates ? { from, to } : {}) }); };
  const data = result.data;
  const cols = data ? [...new Set(data.rows.flatMap((r) => Object.keys(r)))] : [];
  const save = () => {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([csv(data.rows)], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `hierarchy-${data.kind.toLowerCase()}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <Shell title="Consolidated reports" subtitle="Per-church figures for a circuit, district or conference you are allowed to report on. Totals only, no personal detail.">
      <section className={`${card} space-y-4`} aria-label="Report options">
        {circuits.isLoading ? <LoadingBlock /> : circuits.error ? <ErrorBlock error={circuits.error} /> : units.length === 0 ? (
          <EmptyBlock message="No circuits to report on. You do not hold a role that lets you see a circuit, district or conference." />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block text-sm font-medium text-gray-700">Unit
                <select className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" value={unit?.key ?? ''} onChange={(e) => setUnitKey(e.target.value)}>
                  {units.map((u) => <option key={u.key} value={u.key}>{u.name}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium text-gray-700">Report
                <select className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
                  {KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.text}</option>)}
                </select>
              </label>
              {meta.dates && <FormField label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}
              {meta.dates && <FormField label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />}
            </div>
            <p className="text-sm text-gray-500">{meta.hint}</p>
            <button type="button" className={primaryBtn} onClick={run} disabled={result.isFetching}>{result.isFetching ? 'Running…' : 'Run report'}</button>
          </>
        )}
      </section>

      {params && (result.isLoading ? <LoadingBlock /> : result.error ? <ErrorBlock error={result.error} onRetry={() => result.refetch()} /> : data && (
        <section className={`${card} space-y-3`} aria-label="Results">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium text-gray-900">{data.scopeName}: {data.churchCount} church(es)</h2>
            <button type="button" className={secondaryBtn} onClick={save}>Download CSV</button>
          </div>
          {data.truncated && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Only the first 500 churches are included, so these figures are incomplete.</p>}
          {data.churchCount === 0 ? <EmptyBlock message="This unit has no churches yet." /> : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead><tr>{cols.map((c) => <th key={c} className={th}>{label(c)}</th>)}</tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {data.rows.map((r, i) => (
                    <tr key={i} className={r.church === 'TOTAL' ? 'bg-gray-50 font-medium' : ''}>{cols.map((c) => <td key={c} className={td}>{r[c] ?? ''}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-gray-500">Generated {new Date(data.generatedAt).toLocaleString()}. Currencies are never added together.</p>
        </section>
      ))}
    </Shell>
  );
};
