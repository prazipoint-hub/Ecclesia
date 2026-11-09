import { z } from 'zod';
import { prisma } from '@/database';
import { logger } from '@/config/logger';
import { allowedAt } from '@/features/access/service/scope';
import type { AuthorizedUser } from '@/types';
import { ForbiddenError, NotFoundError, ValidationError } from '@/types/errors';
import { D } from '@/features/accounting/service/money';

/**
 * Consolidated reports for a conference, district or circuit. The caller must hold `report:view:hierarchy` AT that unit
 * (own-unit token permission or a scoped grant), checked on the server for every run. Output is counts and totals per
 * church plus a roll-up; money is never added across currencies and no member-level data is returned.
 */
export const HIERARCHY_KINDS = ['MEMBERSHIP', 'INCOME', 'DEPOSITS', 'ATTENDANCE'] as const;
export const HierarchyReportSchema = z.object({
  kind: z.enum(HIERARCHY_KINDS),
  scopeType: z.enum(['CONFERENCE', 'DISTRICT', 'CIRCUIT']),
  scopeId: z.string().trim().min(1).max(64),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).strict();
export const HIERARCHY_PERMISSION = 'report:view:hierarchy';
const MAX_CHURCHES = 500;
const MAX_RANGE_MS = 800 * 86_400_000;

type Row = Record<string, unknown>;

export class HierarchyReportService {
  async run(user: AuthorizedUser, raw: unknown) {
    const input = HierarchyReportSchema.parse(raw);
    const scope = { type: input.scopeType, id: input.scopeId } as const;
    if (!(await allowedAt(user, HIERARCHY_PERMISSION, scope))) throw new ForbiddenError(`Forbidden: ${HIERARCHY_PERMISSION} permission required for this ${scope.type.toLowerCase()}`);

    const needsDates = input.kind !== 'MEMBERSHIP';
    if (needsDates && (!input.from || !input.to)) throw new ValidationError('Choose a start and an end date');
    if (input.from && input.to) {
      if (input.from > input.to) throw new ValidationError('The start date must be before the end date');
      if (input.to.getTime() - input.from.getTime() > MAX_RANGE_MS) throw new ValidationError('Choose a period of about two years or less');
    }

    const unit = await this.unit(scope.type, scope.id);
    if (!unit) throw new NotFoundError(scope.type.charAt(0) + scope.type.slice(1).toLowerCase());
    const churches = await prisma.church.findMany({ where: unit.where, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: MAX_CHURCHES + 1 });
    const truncated = churches.length > MAX_CHURCHES;
    const list = churches.slice(0, MAX_CHURCHES);
    const ids = list.map((c) => c.id);
    const rows = ids.length ? await this.build(input.kind, ids, list, input.from, input.to) : [];

    await prisma.auditLog.create({ data: { churchId: user.churchId, action: 'REPORT_GENERATED', entityType: 'REPORT', entityId: `HIERARCHY_${input.kind}`, actorId: user.memberId ?? user.id, changes: JSON.stringify({ kind: input.kind, scope }) } })
      .catch((err) => logger.error({ err }, 'Failed to audit hierarchy report'));
    return { kind: input.kind, scope, scopeName: unit.name, churchCount: list.length, truncated, generatedAt: new Date(), rows };
  }

  private async unit(type: 'CONFERENCE' | 'DISTRICT' | 'CIRCUIT', id: string) {
    if (type === 'CIRCUIT') {
      const u = await prisma.circuit.findUnique({ where: { id }, select: { name: true } });
      return u && { name: u.name, where: { circuitId: id } };
    }
    if (type === 'DISTRICT') {
      const u = await prisma.district.findUnique({ where: { id }, select: { name: true } });
      return u && { name: u.name, where: { circuit: { districtId: id } } };
    }
    const u = await prisma.conference.findUnique({ where: { id }, select: { name: true } });
    return u && { name: u.name, where: { circuit: { district: { conferenceId: id } } } };
  }

  private async build(kind: (typeof HIERARCHY_KINDS)[number], ids: string[], churches: Array<{ id: string; name: string }>, from?: Date, to?: Date): Promise<Row[]> {
    const name = new Map(churches.map((c) => [c.id, c.name]));
    if (kind === 'MEMBERSHIP') {
      const g = await prisma.member.groupBy({ by: ['churchId'], where: { churchId: { in: ids }, archivedAt: null, membershipStatus: 'ACTIVE' }, _count: { _all: true } });
      const n = new Map(g.map((r) => [r.churchId, r._count._all]));
      const out: Row[] = ids.map((id) => ({ church: name.get(id), activeMembers: n.get(id) ?? 0 }));
      return [...out, { church: 'TOTAL', activeMembers: out.reduce((s, r) => s + (r.activeMembers as number), 0) }];
    }
    if (kind === 'ATTENDANCE') {
      const events = await prisma.event.findMany({
        where: { churchId: { in: ids }, status: { in: ['ONGOING', 'COMPLETED'] }, startDateTime: { gte: from, lte: to } },
        select: { churchId: true, _count: { select: { attendances: { where: { status: 'PRESENT' } } } } }, take: 20000,
      });
      const agg = new Map<string, { events: number; present: number }>();
      events.forEach((e) => { const c = agg.get(e.churchId) ?? { events: 0, present: 0 }; agg.set(e.churchId, { events: c.events + 1, present: c.present + e._count.attendances }); });
      const out: Row[] = ids.map((id) => ({ church: name.get(id), events: agg.get(id)?.events ?? 0, present: agg.get(id)?.present ?? 0 }));
      return [...out, { church: 'TOTAL', events: out.reduce((s, r) => s + (r.events as number), 0), present: out.reduce((s, r) => s + (r.present as number), 0) }];
    }
    const grouped = kind === 'INCOME'
      ? await prisma.receipt.groupBy({ by: ['churchId', 'currency'], where: { churchId: { in: ids }, status: 'ISSUED', issuedAt: { gte: from, lte: to } }, _sum: { amount: true }, _count: { _all: true } })
      : await prisma.deposit.groupBy({ by: ['churchId', 'currency'], where: { churchId: { in: ids }, status: 'VERIFIED', depositDate: { gte: from, lte: to } }, _sum: { amount: true }, _count: { _all: true } });
    const totals = new Map<string, { amount: ReturnType<typeof D>; count: number }>();
    const out: Row[] = grouped.map((g) => {
      const t = totals.get(g.currency) ?? { amount: D(0), count: 0 };
      totals.set(g.currency, { amount: t.amount.plus(g._sum.amount ?? 0), count: t.count + g._count._all });
      return { church: name.get(g.churchId), currency: g.currency, amount: D(g._sum.amount ?? 0).toFixed(2), count: g._count._all };
    });
    out.sort((a, b) => String(a.church).localeCompare(String(b.church)) || String(a.currency).localeCompare(String(b.currency)));
    return [...out, ...[...totals.entries()].sort().map(([currency, t]) => ({ church: 'TOTAL', currency, amount: t.amount.toFixed(2), count: t.count }))];
  }
}

export const hierarchyReportService = new HierarchyReportService();
