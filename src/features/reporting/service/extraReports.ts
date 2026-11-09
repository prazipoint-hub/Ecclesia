import { prisma } from '@/database';
import type { AuthorizedUser } from '@/types';
import { depositService } from '@/features/accounting/service/deposits';
import { profileCompletionService } from '@/features/members/service/profileCompletion';
import { appointmentService } from '@/features/leadership/service/appointments';

type Row = Record<string, unknown>;
const parse = <T>(s: string | null | undefined): T | null => { try { return s ? (JSON.parse(s) as T) : null; } catch { return null; } };

/** Reports built on the new workflows. Every report re-checks the caller's permission inside the service it calls, and returns flat rows. */
export const extraReports = {
  /** Counts only; the percentage rule is the church's configured required-field rule. */
  async profileCompletion(user: AuthorizedUser): Promise<Row[]> {
    const r = await profileCompletionService.report(user);
    return [
      { measure: 'ACTIVE_MEMBERS', value: r.activeMembers },
      { measure: 'COMPLETE', value: r.complete },
      { measure: 'AVERAGE_PERCENT', value: r.averagePercent },
      ...Object.entries(r.missingByField).map(([field, n]) => ({ measure: `MISSING_${field.toUpperCase()}`, value: n })),
    ];
  },

  /** Appointments effective at `asOf` (default now), using the stored term dates, not today's status. */
  async leadershipRegister(user: AuthorizedUser, asOf?: Date): Promise<Row[]> {
    const out: Row[] = [];
    for (let page = 1; page <= 20; page += 1) {
      const res = await appointmentService.list(user, { asOf: asOf ?? new Date(), page, pageSize: 200 });
      res.appointments.forEach((a) => out.push({ membershipNumber: a.member.membershipNumber, member: a.member.name, position: a.position.name, group: a.position.groupName, scopeType: a.scope.type, termStart: a.termStart, termEnd: a.termEnd, status: a.status }));
      if (out.length >= res.total || res.appointments.length === 0) break;
    }
    return out;
  },

  /** Cash sessions in the period: submitted/approved totals per currency, discrepancies and who reviewed. */
  async cashSessions(user: AuthorizedUser, start: Date, end: Date): Promise<Row[]> {
    const sessions = await prisma.cashSession.findMany({ where: { churchId: user.churchId, sessionDate: { gte: start, lte: end } }, orderBy: { sessionDate: 'asc' }, take: 5000 });
    return sessions.map((s) => {
      const snap = parse<{ cashReceipts?: Record<string, string>; expected?: Record<string, string> }>(s.snapshotJson);
      const counts = parse<{ variances?: Record<string, string> }>(s.countsJson);
      const variances = counts?.variances ?? {};
      return {
        sessionId: s.id, date: s.sessionDate, status: s.status, cashier: s.handledBy, currencyFloat: s.currency,
        cashReceipts: snap?.cashReceipts ? JSON.stringify(snap.cashReceipts) : '', expected: snap?.expected ? JSON.stringify(snap.expected) : '',
        variance: Object.keys(variances).length ? JSON.stringify(variances) : '', discrepancy: Object.values(variances).some((v) => Number(v) !== 0),
        submittedAt: s.submittedAt, reviewedBy: s.reviewedBy, reviewedAt: s.reviewedAt, submissions: s.submissionNo,
      };
    });
  },

  async deposits(user: AuthorizedUser, start: Date, end: Date): Promise<Row[]> {
    const all = await depositService.list(user);
    return all.filter((d) => d.depositDate >= start && d.depositDate <= end).map((d) => ({ date: d.depositDate, currency: d.currency, amount: d.amount, bankReference: d.bankReference, status: d.status, cashSessionId: d.cashSessionId, journalEntryId: d.journalEntryId }));
  },

  /** Approved vs pending cash, deposits and outstanding, one row per currency per measure. Currencies are never added together. */
  async treasurer(user: AuthorizedUser): Promise<Row[]> {
    const o = await depositService.overview(user);
    const rows: Row[] = [];
    const add = (measure: string, bucket: Record<string, string>) => Object.entries(bucket).forEach(([currency, amount]) => rows.push({ measure, currency, amount }));
    add('APPROVED_CASH', o.approvedCash); add('PENDING_CASH', o.pendingCash); add('DEPOSITS_VERIFIED', o.depositsVerified);
    add('DEPOSITS_AWAITING_VERIFICATION', o.depositsAwaitingVerification); add('UNDEPOSITED_CASH', o.undepositedCash);
    return rows;
  },

  /** Each person is counted once in the church total; organisation counts overlap by design and are labelled as such. */
  async membershipDistinct(user: AuthorizedUser): Promise<Row[]> {
    const active = { churchId: user.churchId, archivedAt: null, membershipStatus: 'ACTIVE' };
    const [total, bySection, orgs] = await Promise.all([
      prisma.member.count({ where: active }),
      prisma.member.groupBy({ by: ['sectionId'], where: active, _count: { _all: true } }),
      prisma.organizationMembership.groupBy({ by: ['organizationId'], where: { membershipStatus: 'ACTIVE', endedAt: null, organization: { churchId: user.churchId }, member: active } as never, _count: { memberId: true } } as never),
    ]);
    return [
      { measure: 'DISTINCT_ACTIVE_MEMBERS', key: 'CHURCH', value: total },
      ...(bySection as Array<{ sectionId: string | null; _count: { _all: number } }>).map((s) => ({ measure: 'ACTIVE_BY_SECTION', key: s.sectionId ?? 'NO_SECTION', value: s._count._all })),
      ...(orgs as unknown as Array<{ organizationId: string; _count: { memberId: number } }>).map((o) => ({ measure: 'ORGANISATION_MEMBERSHIPS_OVERLAP_ALLOWED', key: o.organizationId, value: o._count.memberId })),
    ];
  },
};
