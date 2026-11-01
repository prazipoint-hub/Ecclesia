import { Prisma } from '@prisma/client';
import type { AuthorizedUser } from '@/types';
import { ForbiddenError, NotFoundError } from '@/types/errors';
import { dashboardRepository as repository } from '../repository/dashboard';

const DAY = 24 * 60 * 60 * 1000;
const money = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
const num = (value: Prisma.Decimal) => Number(value.toFixed(2));
const monthKey = (d: Date) => d.toISOString().slice(0, 7);
const startOfMonthUtc = (d: Date, back = 0) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1));
const weekStart = (d: Date) => {
  const day = d.getUTCDay();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((day + 6) % 7)));
};

type Money = { amount: Prisma.Decimal.Value };
const sum = (rows: Money[]) => rows.reduce((total, r) => total.plus(money(r.amount)), money(0));

export class DashboardService {
  /** Every block is included only if the viewer holds the permission that block needs; a missing block is null. */
  async church(user: AuthorizedUser) {
    const can = (permission: string) => user.permissions.includes(permission);
    const now = new Date();
    const [members, attendance, finance, pastoral, upcoming] = await Promise.all([
      can('member:view') ? this.members(user.churchId, now) : null,
      can('event:view') ? this.attendance(user.churchId, now) : null,
      can('finance:view') ? this.finance(user.churchId, now) : null,
      can('pastoral:dashboard:view') ? this.pastoral(user.churchId, now) : null,
      can('event:view') ? repository.upcomingEvents(user.churchId, now, 5) : null,
    ]);
    return { generatedAt: now, members, attendance, finance, pastoral, upcomingEvents: upcoming };
  }

  async section(user: AuthorizedUser, sectionId: string) {
    const can = (permission: string) => user.permissions.includes(permission);
    const section = await repository.findSection(user.churchId, sectionId);
    if (!section) throw new NotFoundError('Section');
    const now = new Date();
    const since = startOfMonthUtc(now, 5);
    const [members, attendance, receipts, spending] = await Promise.all([
      can('member:view') ? this.members(user.churchId, now, sectionId) : null,
      can('event:view') ? this.attendance(user.churchId, now, sectionId) : null,
      can('section_finance:view') ? repository.sectionReceiptsSince(sectionId, since) : null,
      can('section_finance:view') ? repository.sectionSpendingSince(sectionId, since) : null,
    ]);
    return {
      generatedAt: now,
      section,
      members,
      attendance,
      finance: receipts && spending ? { months: this.monthlySeries(now, receipts.map((r) => ({ at: r.issuedAt, amount: r.amount })), spending.map((s) => ({ at: s.approvedAt!, amount: s.amount }))) } : null,
    };
  }

  /** Circuit, district or conference totals for the viewer's own place in the hierarchy: counts per church, nothing personal. */
  async hierarchy(user: AuthorizedUser, level: 'CIRCUIT' | 'DISTRICT' | 'CONFERENCE') {
    if (!user.permissions.includes('report:view:all_churches')) throw new ForbiddenError('Forbidden: report:view:all_churches permission required');
    const chain = await repository.findChurchChain(user.churchId);
    const circuit = chain?.circuit;
    const district = circuit?.district;
    const conference = district?.conference;
    const target = level === 'CIRCUIT' ? circuit : level === 'DISTRICT' ? district : conference;
    if (!chain || !target) throw new NotFoundError(`${level.charAt(0)}${level.slice(1).toLowerCase()} for your church`);

    const churches = await repository.churchesIn(
      level === 'CIRCUIT' ? { circuitId: circuit!.id } : level === 'DISTRICT' ? { circuit: { districtId: district!.id } } : { circuit: { district: { conferenceId: conference!.id } } }
    );
    const ids = churches.map((c) => c.id);
    const since = new Date(Date.now() - 30 * DAY);
    const [members, events] = ids.length ? await Promise.all([repository.activeMembersByChurch(ids), repository.attendanceByChurch(ids, since)]) : [[], []];
    const memberCount = new Map(members.map((m) => [m.churchId, m._count._all]));
    const attendance = new Map<string, { events: number; present: number }>();
    for (const e of events) {
      const cur = attendance.get(e.churchId) ?? { events: 0, present: 0 };
      attendance.set(e.churchId, { events: cur.events + 1, present: cur.present + e._count.attendances });
    }
    const rows = churches.map((c) => ({
      churchId: c.id, name: c.name, circuit: c.circuit?.name ?? null,
      activeMembers: memberCount.get(c.id) ?? 0,
      eventsLast30Days: attendance.get(c.id)?.events ?? 0,
      attendanceLast30Days: attendance.get(c.id)?.present ?? 0,
    }));
    return {
      generatedAt: new Date(), level, name: target.name,
      totals: { churches: rows.length, activeMembers: rows.reduce((s, r) => s + r.activeMembers, 0), attendanceLast30Days: rows.reduce((s, r) => s + r.attendanceLast30Days, 0) },
      churches: rows,
    };
  }

  // ------------------------------------------------------------ blocks

  private async members(churchId: string, now: Date, sectionId?: string) {
    const [byStatus, byGender, joined] = await Promise.all([
      repository.membersByStatus(churchId, sectionId),
      repository.membersByGender(churchId, sectionId),
      repository.newMembersSince(churchId, startOfMonthUtc(now), sectionId),
    ]);
    const status = Object.fromEntries(byStatus.map((r) => [r.membershipStatus, r._count._all]));
    return { total: byStatus.reduce((s, r) => s + r._count._all, 0), active: status.ACTIVE ?? 0, byStatus: status, activeByGender: Object.fromEntries(byGender.map((r) => [r.gender ?? 'UNSPECIFIED', r._count._all])), joinedThisMonth: joined };
  }

  /** Eight weeks of attendance, so a dip is visible at a glance. */
  private async attendance(churchId: string, now: Date, sectionId?: string) {
    const since = new Date(weekStart(now).getTime() - 7 * 7 * DAY);
    const events = await repository.recentEvents(churchId, since, sectionId);
    const weeks = new Map<string, { events: number; present: number }>();
    for (let i = 0; i < 8; i++) weeks.set(new Date(since.getTime() + i * 7 * DAY).toISOString().slice(0, 10), { events: 0, present: 0 });
    for (const e of events) {
      const key = weekStart(e.startDateTime).toISOString().slice(0, 10);
      const cur = weeks.get(key);
      if (cur) weeks.set(key, { events: cur.events + 1, present: cur.present + e._count.attendances });
    }
    const series = [...weeks.entries()].map(([week, v]) => ({ week, ...v }));
    const total = series.reduce((s, w) => s + w.present, 0);
    const counted = events.length;
    return { weeks: series, totalPresent: total, averagePerEvent: counted ? Math.round((total / counted) * 10) / 10 : 0, truncated: events.length === 500 };
  }

  private async finance(churchId: string, now: Date) {
    const since = startOfMonthUtc(now, 5);
    const [receipts, spending, awaiting] = await Promise.all([repository.receiptsSince(churchId, since), repository.spendingSince(churchId, since), repository.awaitingApproval(churchId)]);
    const thisMonth = startOfMonthUtc(now);
    const byCurrency = new Map<string, Prisma.Decimal>();
    const byType = new Map<string, Prisma.Decimal>();
    for (const r of receipts.filter((x) => x.issuedAt >= thisMonth)) {
      byCurrency.set(r.currency, (byCurrency.get(r.currency) ?? money(0)).plus(money(r.amount)));
      byType.set(r.incomeType, (byType.get(r.incomeType) ?? money(0)).plus(money(r.amount)));
    }
    return {
      incomeThisMonth: Object.fromEntries([...byCurrency].map(([c, v]) => [c, num(v)])),
      incomeThisMonthByType: Object.fromEntries([...byType].map(([t, v]) => [t, num(v)])),
      spendingThisMonth: num(sum(spending.filter((s) => s.approvedAt! >= thisMonth))),
      awaitingApproval: awaiting,
      months: this.monthlySeries(now, receipts.map((r) => ({ at: r.issuedAt, amount: r.amount })), spending.map((s) => ({ at: s.approvedAt!, amount: s.amount }))),
      note: 'Spending is not split by currency; income is shown per currency for this month and combined in the monthly series.',
      truncated: receipts.length === 5000 || spending.length === 5000,
    };
  }

  private monthlySeries(now: Date, income: Array<{ at: Date; amount: Prisma.Decimal.Value }>, spend: Array<{ at: Date; amount: Prisma.Decimal.Value }>) {
    return Array.from({ length: 6 }, (_, i) => {
      const start = startOfMonthUtc(now, 5 - i);
      const key = monthKey(start);
      return {
        month: key,
        income: num(sum(income.filter((r) => monthKey(r.at) === key))),
        spending: num(sum(spend.filter((r) => monthKey(r.at) === key))),
      };
    });
  }

  private async pastoral(churchId: string, now: Date) {
    const [openCases, overdue] = await Promise.all([repository.openCases(churchId), repository.overdueFollowUps(churchId, now)]);
    return { openCases, overdueFollowUps: overdue };
  }
}

export const dashboardService = new DashboardService();
