import type { ReactNode } from 'react';
import { card } from '@/pages/account/shared';
import { money } from '@/pages/finance/financeShared';
import type { AttendanceBlock, MembersBlock, MonthPoint } from '@/types/reports';
import { label } from './reportsShared';

export const Tile = ({ name, value, hint }: { name: string; value: ReactNode; hint?: string }) => (
  <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
    <p className="text-sm text-gray-500">{name}</p>
    <p className="mt-1 text-2xl font-medium text-gray-900">{value}</p>
    {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
  </div>
);

export const Block = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className={`${card} space-y-3`}>
    <h2 className="font-medium text-gray-900">{title}</h2>
    {children}
  </section>
);

/** A row of vertical bars, each scaled to the largest value. */
export const Bars = ({ items, unit = '' }: { items: Array<{ name: string; value: number }>; unit?: string }) => {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="flex h-40 items-end gap-2" role="img" aria-label={items.map((i) => `${i.name}: ${i.value}${unit}`).join(', ')}>
      {items.map((i) => (
        <div key={i.name} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
          <span className="text-xs tabular-nums text-gray-600">{i.value}</span>
          <div className="w-full rounded-t bg-primary-500" style={{ height: `${Math.max((i.value / max) * 100, i.value > 0 ? 3 : 0)}%` }} />
          <span className="text-[10px] text-gray-500">{i.name}</span>
        </div>
      ))}
    </div>
  );
};

/** Income and spending side by side for each month. */
export const IncomeSpendingBars = ({ months }: { months: MonthPoint[] }) => {
  const max = Math.max(...months.flatMap((m) => [m.income, m.spending]), 1);
  return (
    <div>
      <div className="flex h-40 items-end gap-3" role="img" aria-label={months.map((m) => `${m.month}: income ${m.income}, spending ${m.spending}`).join('; ')}>
        {months.map((m) => (
          <div key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <div className="flex h-full w-full items-end gap-1">
              <div className="w-1/2 rounded-t bg-green-500" title={`Income ${money(m.income)}`} style={{ height: `${Math.max((m.income / max) * 100, m.income > 0 ? 3 : 0)}%` }} />
              <div className="w-1/2 rounded-t bg-amber-500" title={`Spending ${money(m.spending)}`} style={{ height: `${Math.max((m.spending / max) * 100, m.spending > 0 ? 3 : 0)}%` }} />
            </div>
            <span className="text-[10px] text-gray-500">{m.month.slice(5)}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 flex gap-4 text-xs text-gray-600"><span><span className="mr-1 inline-block h-2 w-2 rounded bg-green-500" />Income</span><span><span className="mr-1 inline-block h-2 w-2 rounded bg-amber-500" />Spending</span></p>
    </div>
  );
};

export const MembersBlockView = ({ data, title = 'Members' }: { data: MembersBlock; title?: string }) => (
  <Block title={title}>
    <div className="grid gap-3 sm:grid-cols-3">
      <Tile name="Total on record" value={data.total} />
      <Tile name="Active" value={data.active} />
      <Tile name="Joined this month" value={data.joinedThisMonth} />
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <Breakdown title="By status" values={data.byStatus} />
      <Breakdown title="Active members by gender" values={data.activeByGender} />
    </div>
  </Block>
);

const Breakdown = ({ title, values }: { title: string; values: Record<string, number> }) => {
  const entries = Object.entries(values);
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-gray-700">{title}</h3>
      <ul className="space-y-1.5">
        {entries.map(([k, v]) => (
          <li key={k} className="text-sm">
            <div className="flex justify-between text-gray-700"><span>{label(k)}</span><span className="tabular-nums">{v}</span></div>
            <div className="h-1.5 rounded bg-gray-100"><div className="h-1.5 rounded bg-primary-500" style={{ width: `${(v / total) * 100}%` }} /></div>
          </li>
        ))}
        {entries.length === 0 && <li className="text-sm text-gray-500">No data.</li>}
      </ul>
    </div>
  );
};

export const AttendanceBlockView = ({ data }: { data: AttendanceBlock }) => (
  <Block title="Attendance, last 8 weeks">
    <Bars items={data.weeks.map((w) => ({ name: w.week.slice(5), value: w.present }))} />
    <p className="text-sm text-gray-600">{data.totalPresent} present in total · {data.averagePerEvent} per event</p>
    {data.truncated && <p role="note" className="text-xs text-amber-700">Only the first 500 events are counted, so these figures are incomplete.</p>}
  </Block>
);
