import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/database';
import { logger } from '@/config/logger';
import type { AuthorizedUser } from '@/types';
import { ConflictError, ValidationError } from '@/types/errors';
import { parseCsv } from '@/features/members/service/csv';
import { ImportJobService, MAX_ROWS } from '@/features/members/service/importJobs';
import { nameKey } from '@/features/members/service/importTemplate';
import { catalogueService } from './catalogue';
import { exclusiveEnd } from './appointments';

export const LEADERSHIP_TEMPLATE_VERSION = '1.0';
export const LEADERSHIP_COLUMNS = ['name', 'surname', 'phone', 'leadership_role', 'committee_or_board', 'department', 'organization', 'section', 'term_start', 'term_end', 'appointment_status'];
const ALIASES: Record<string, string> = {
  name: 'firstName', firstname: 'firstName', surname: 'lastName', lastname: 'lastName', phone: 'phone', membernumber: 'memberNumber', membershipnumber: 'memberNumber',
  leadershiprole: 'role', role: 'role', position: 'role', committeeorboard: 'committee', committee: 'committee', board: 'committee', department: 'department',
  organization: 'organization', organisation: 'organization', section: 'section', termstart: 'termStart', termend: 'termEnd', appointmentstatus: 'status',
};
const norm = (h: string) => h.trim().toLowerCase().replace(/[\s_\-]/g, '');
const validDate = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v; // rejects 2026-13-01 and 2026-02-30
};
const j = (v: unknown) => JSON.stringify(v);
const digits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

type Person = { id: string; firstName: string; lastName: string; phone: string | null; membershipNumber: string; membershipStatus: string; archivedAt: Date | null };
type Plan = {
  memberId: string; positionId: string; positionCode: string; positionName: string; scopeType: 'CHURCH' | 'ORGANIZATION'; scopeId: string;
  sectionId: string | null; committeeId: string | null; department: string | null; termStart: string; termEnd: string | null; finalStatus: 'ACTIVE' | 'PENDING' | 'ENDED'; grantsAfterApproval: string[];
};

/**
 * Leadership appointments from CSV. Matches EXISTING members only; it can never create a person. Positions that
 * map to a permission bundle always land PENDING and need a different person's approval, so a crafted CSV cannot
 * give anyone access by itself. Same staged/partial/retry-safe machinery as the membership import.
 */
export class LeadershipImportService extends ImportJobService {
  constructor() { super('LEADERSHIP'); }

  override template() { return { filename: `ecclesia-leadership-template-v${LEADERSHIP_TEMPLATE_VERSION}.csv`, version: LEADERSHIP_TEMPLATE_VERSION, csv: `${LEADERSHIP_COLUMNS.join(',')}\r\n` }; }

  override async stage(user: AuthorizedUser, csv: string, fileName: string) {
    this.guard(user);
    const contentHash = createHash('sha256').update(csv).digest('hex');
    const same = await prisma.memberImportJob.findFirst({ where: { churchId: user.churchId, kind: 'LEADERSHIP', contentHash, status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'desc' } });
    if (same) return { ...(await this.summary(same)), reused: true };

    let table: string[][];
    try { table = parseCsv(csv); } catch (e) { throw new ValidationError(`The file is not valid CSV: ${(e as Error).message}`); }
    if (table.length < 2) throw new ValidationError('The file needs a header row and at least one appointment');
    if (table.length - 1 > MAX_ROWS) throw new ValidationError(`Too many rows (limit ${MAX_ROWS} per import)`);
    const cols = table[0].map((h) => ALIASES[norm(h)] ?? null);
    const missing: string[] = ['role', 'termStart'].filter((c) => !cols.includes(c)).map((c) => (c === 'role' ? 'leadership_role' : 'term_start'));
    if (!cols.includes('memberNumber')) for (const c of ['firstName', 'lastName']) if (!cols.includes(c)) missing.push(c === 'firstName' ? 'name' : 'surname');
    if (missing.length) throw new ValidationError(`The header row must include: ${missing.join(', ')}. Download the template for the exact columns.`);

    const [resolve, sections, orgs, committees] = await Promise.all([
      catalogueService.resolver(user.churchId),
      prisma.section.findMany({ where: { churchId: user.churchId }, select: { id: true, name: true } }),
      prisma.organization.findMany({ where: { churchId: user.churchId, status: 'ACTIVE' }, select: { id: true, name: true, shortName: true } }),
      prisma.committee.findMany({ where: { churchId: user.churchId }, select: { id: true, name: true } }),
    ]);
    const sectionBy = new Map(sections.map((s) => [nameKey(s.name), s.id]));
    const orgBy = new Map<string, string>(); for (const o of orgs) { orgBy.set(nameKey(o.name), o.id); orgBy.set(nameKey(o.shortName), o.id); }
    const committeeBy = new Map(committees.map((c) => [nameKey(c.name), c.id]));

    const body = table.slice(1).map((cells, i) => {
      const raw: Record<string, string> = {}; const m: Record<string, string> = {};
      table[0].forEach((h, c) => { raw[h.trim()] = cells[c] ?? ''; const k = cols[c]; if (k) m[k] = (cells[c] ?? '').trim(); });
      return { rowNumber: i + 2, raw, m };
    });
    const numbers = [...new Set(body.map((b) => b.m.memberNumber).filter(Boolean))];
    const surnames = [...new Set(body.map((b) => b.m.lastName).filter(Boolean))];
    const people: Person[] = numbers.length || surnames.length
      ? ((await prisma.member.findMany({
          where: { churchId: user.churchId, OR: [...(numbers.length ? [{ membershipNumber: { in: numbers } }] : []), ...(surnames.length ? [{ lastName: { in: surnames } }] : [])] },
          select: { id: true, firstName: true, lastName: true, phone: true, membershipNumber: true, membershipStatus: true, archivedAt: true },
        })) as Person[])
      : [];
    const mappedRoleIds = [...new Set(body.map((b) => (b.m.role ? resolve(b.m.role)?.mappedRoleId : null)).filter((x): x is string => !!x))];
    const roles = mappedRoleIds.length ? await prisma.role.findMany({ where: { id: { in: mappedRoleIds } }, include: { permissions: { include: { permission: true } } } }) : [];
    const permsOf = new Map(roles.map((r) => [r.id, r.permissions.map((p) => p.permission.name)]));
    const existingAppts = await prisma.appointment.findMany({ where: { churchId: user.churchId, status: { in: ['PENDING', 'ACTIVE', 'ENDED'] } }, select: { memberId: true, positionId: true, scopeType: true, scopeId: true, termStart: true, termEnd: true } });

    const rows: Prisma.MemberImportRowCreateManyInput[] = [];
    const seen = new Set<string>();
    for (const b of body) {
      const { m } = b; const errors: string[] = []; const warnings: string[] = []; let matches: unknown[] = []; let status = 'VALID'; let reason: string | null = null; let plan: Plan | null = null;

      // --- who
      let person: Person | null = null; let candidates: Person[] = [];
      if (m.memberNumber) {
        person = people.find((p) => p.membershipNumber === m.memberNumber) ?? null;
        if (!person) errors.push(`member_number: ${m.memberNumber} is not a member of this church`);
        else if ((m.firstName && nameKey(m.firstName) !== nameKey(person.firstName)) || (m.lastName && nameKey(m.lastName) !== nameKey(person.lastName))) { errors.push(`member_number ${m.memberNumber} belongs to ${person.firstName} ${person.lastName}, not the name on this row`); person = null; }
      } else if (!m.firstName || !m.lastName) errors.push('name and surname are required (or a member_number)');
      else {
        candidates = people.filter((p) => nameKey(p.firstName) === nameKey(m.firstName) && nameKey(p.lastName) === nameKey(m.lastName));
        if (candidates.length > 1 && m.phone) { const byPhone = candidates.filter((c) => digits(c.phone).slice(-9) === digits(m.phone).slice(-9) && digits(m.phone)); if (byPhone.length === 1) candidates = byPhone; }
        if (candidates.length === 0) errors.push(`no existing member named ${m.firstName} ${m.lastName}; leadership import never creates people. Add them to the register first`);
        else if (candidates.length === 1) person = candidates[0];
      }
      if (person && (person.archivedAt || person.membershipStatus !== 'ACTIVE')) { errors.push(`${person.firstName} ${person.lastName} is not an active member`); person = null; }
      if (person && m.phone && person.phone && digits(person.phone).slice(-9) !== digits(m.phone).slice(-9)) warnings.push('phone differs from the register; matched on name');

      // --- what
      const position = m.role ? resolve(m.role) : null;
      if (!m.role) errors.push('leadership_role: required'); else if (!position) errors.push(`leadership_role: "${m.role}" is not a known position`);
      let scopeType: 'CHURCH' | 'ORGANIZATION' = 'CHURCH'; let scopeId = user.churchId;
      if (position) {
        if (position.scopeKind === 'ORGANIZATION') {
          const oid = m.organization ? orgBy.get(nameKey(m.organization)) : null;
          if (!m.organization) errors.push(`organization: required for ${position.name}`); else if (!oid) errors.push(`organization: "${m.organization}" does not exist in this church`); else { scopeType = 'ORGANIZATION'; scopeId = oid; }
        } else if (m.organization) errors.push(`organization: ${position.name} is not an organisation position`);
      }
      const sectionId = m.section ? sectionBy.get(nameKey(m.section)) ?? null : null;
      if (m.section && !sectionId) errors.push(`section: "${m.section}" does not exist in this church`);
      const committeeId = m.committee ? committeeBy.get(nameKey(m.committee)) ?? null : null;
      if (m.committee && !committeeId) errors.push(`committee_or_board: "${m.committee}" does not exist in this church`);

      // --- when
      if (!m.termStart) errors.push('term_start: required'); else if (!validDate(m.termStart)) errors.push('term_start: use a real date as YYYY-MM-DD');
      if (m.termEnd && !validDate(m.termEnd)) errors.push('term_end: use a real date as YYYY-MM-DD');
      else if (m.termEnd && m.termStart && validDate(m.termStart) && m.termEnd < m.termStart) errors.push('term_end: is before term_start');
      const requested = (m.status || 'ACTIVE').toUpperCase();
      if (!['ACTIVE', 'PENDING', 'ENDED'].includes(requested)) errors.push(`appointment_status: "${m.status}" is not ACTIVE, PENDING or ENDED (revoke appointments in the app)`);

      if (!errors.length && position && (person || candidates.length > 1)) {
        const finalStatus: Plan['finalStatus'] = requested === 'ENDED' ? 'ENDED' : position.mappedRoleId ? 'PENDING' : (requested as 'ACTIVE' | 'PENDING');
        const grants = position.mappedRoleId ? permsOf.get(position.mappedRoleId) ?? [] : [];
        if (position.mappedRoleId && finalStatus === 'PENDING') warnings.push(`${position.name} carries system access (${grants.length} permissions); it will wait for approval by another administrator`);
        const start = new Date(`${m.termStart}T00:00:00.000Z`); const end = m.termEnd ? exclusiveEnd(m.termEnd) : null;
        plan = { memberId: person?.id ?? '', positionId: position.id, positionCode: position.code, positionName: position.name, scopeType, scopeId, sectionId, committeeId, department: m.department || null, termStart: m.termStart, termEnd: m.termEnd || null, finalStatus, grantsAfterApproval: finalStatus === 'PENDING' ? grants : [] };
        if (!person) { status = 'REVIEW'; reason = 'AMBIGUOUS_PERSON'; matches = candidates.map((c) => ({ memberId: c.id, membershipNumber: c.membershipNumber, name: `${c.firstName} ${c.lastName}`, phone: c.phone ? `…${digits(c.phone).slice(-3)}` : null })); }
        else {
          const key = `${person.id}|${position.id}|${scopeType}|${scopeId}|${m.termStart}`;
          const already = existingAppts.some((a) => a.memberId === person!.id && a.positionId === position.id && a.scopeType === scopeType && a.scopeId === scopeId && a.termStart.getTime() === start.getTime()) || seen.has(key);
          seen.add(key);
          if (already) { status = 'SKIPPED'; warnings.push('this appointment already exists (or repeats an earlier row); nothing to do'); }
          else if (!position.allowMultiple && existingAppts.some((a) => a.positionId === position.id && a.scopeId === scopeId && a.memberId !== person!.id && a.termStart < (end ?? new Date(8.64e15)) && (!a.termEnd || a.termEnd > start))) errors.push(`${position.name} allows one holder and another appointment overlaps this term`);
        }
      }
      if (errors.length) { status = 'REJECTED'; plan = null; }
      rows.push({ jobId: '', rowNumber: b.rowNumber, raw: j(b.raw), parsed: plan ? j(plan) : null, status, reason, errors: errors.length ? j(errors) : null, warnings: warnings.length ? j(warnings) : null, matches: matches.length ? j(matches) : null });
    }

    const job = await prisma.$transaction(async (tx) => {
      const created = await tx.memberImportJob.create({ data: { kind: 'LEADERSHIP', churchId: user.churchId, fileName, templateVersion: LEADERSHIP_TEMPLATE_VERSION, contentHash, totalRows: rows.length, createdBy: user.id } });
      for (let i = 0; i < rows.length; i += 500) await tx.memberImportRow.createMany({ data: rows.slice(i, i + 500).map((r) => ({ ...r, jobId: created.id })) });
      return created;
    });
    await this.audit(user, 'LEADERSHIP_IMPORT_STAGED', job.id, { fileName, rows: rows.length });
    return { ...(await this.summary(job)), reused: false };
  }

  /** Choose which existing member an ambiguous row means. The id must be one of the candidates we showed. */
  override async decide(user: AuthorizedUser, jobId: string, decisions: { row: number; decision: string }[]) {
    const job = await this.own(user, jobId);
    if (!['PREVIEWED', 'PARTIAL'].includes(job.status)) throw new ConflictError(`An import that is ${job.status} cannot be changed`);
    const rows = await prisma.memberImportRow.findMany({ where: { jobId, rowNumber: { in: decisions.map((d) => d.row) }, status: 'REVIEW' } });
    let updated = 0;
    for (const r of rows) {
      const d = decisions.find((x) => x.row === r.rowNumber)!.decision;
      const ids = (r.matches ? (JSON.parse(r.matches) as { memberId: string }[]) : []).map((m) => m.memberId);
      if (d !== 'SKIP' && !(d.startsWith('USE:') && ids.includes(d.slice(4)))) throw new ValidationError(`row ${r.rowNumber}: decision must be SKIP or USE:<one of the listed member ids>`);
      updated += (await prisma.memberImportRow.updateMany({ where: { id: r.id, status: 'REVIEW' }, data: { decision: d } })).count;
    }
    await this.audit(user, 'LEADERSHIP_IMPORT_DECISIONS', jobId, { requested: decisions.length, updated });
    return { updated, ignored: decisions.length - updated };
  }

  /** Nothing to re-match: people are chosen explicitly, and a duplicate appointment is caught by its unique key when written. */
  protected override async revalidate() { /* intentionally empty */ }

  protected override async process(jobId: string, churchId: string) {
    let cursor = 0;
    for (let b = 0; b < 10; b += 1) {
      const batch = await prisma.memberImportRow.findMany({
        where: { jobId, rowNumber: { gt: cursor }, OR: [{ status: 'VALID' }, { status: 'REVIEW', decision: { startsWith: 'USE:' } }, { status: 'FAILED' }] },
        orderBy: { rowNumber: 'asc' }, take: 100,
      });
      if (!batch.length) return;
      cursor = batch[batch.length - 1].rowNumber;
      await prisma.memberImportJob.update({ where: { id: jobId }, data: { heartbeatAt: new Date() } });
      for (const row of batch) {
        const plan = JSON.parse(row.parsed!) as Plan;
        const memberId = row.decision?.startsWith('USE:') ? row.decision.slice(4) : plan.memberId;
        try {
          await prisma.$transaction(async (tx) => {
            const member = await tx.member.findUnique({ where: { id: memberId }, select: { churchId: true, membershipStatus: true, archivedAt: true } });
            if (!member || member.churchId !== churchId || member.archivedAt || member.membershipStatus !== 'ACTIVE') throw new RowSkip('the member is no longer an active member of this church');
            const position = await tx.positionDefinition.findUnique({ where: { id: plan.positionId } });
            if (!position || !position.active || position.churchId !== churchId) throw new RowSkip('the position is no longer available');
            // Re-derive the status from the CURRENT mapping: if the position gained system access since the preview, it must still wait for approval.
            const status = plan.finalStatus === 'ENDED' ? 'ENDED' : position.mappedRoleId ? 'PENDING' : plan.finalStatus;
            const appt = await tx.appointment.create({
              data: {
                churchId, memberId, positionId: plan.positionId, scopeType: plan.scopeType, scopeId: plan.scopeId, sectionId: plan.sectionId, committeeId: plan.committeeId, department: plan.department,
                termStart: new Date(`${plan.termStart}T00:00:00.000Z`), termEnd: plan.termEnd ? exclusiveEnd(plan.termEnd) : null, status, createdBy: (await tx.memberImportJob.findUnique({ where: { id: jobId }, select: { createdBy: true } }))?.createdBy ?? 'import', importJobId: jobId,
              },
            });
            // `reason` carries the created appointment id on IMPORTED rows, so the result is traceable from the report.
            await tx.memberImportRow.update({ where: { id: row.id }, data: { status: 'IMPORTED', memberId, reason: appt.id } });
          });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            await prisma.memberImportRow.update({ where: { id: row.id }, data: { status: 'SKIPPED', warnings: j(['this appointment already exists']) } });
          } else if (error instanceof RowSkip) {
            await prisma.memberImportRow.update({ where: { id: row.id }, data: { status: 'FAILED', errors: j([error.message]) } });
          } else {
            logger.error({ err: error, jobId }, 'Leadership import row failed');
            await prisma.memberImportRow.update({ where: { id: row.id }, data: { status: 'FAILED', errors: j(['could not be saved; try confirming again']) } });
          }
        }
      }
    }
  }
}
class RowSkip extends Error {}
export const leadershipImportService = new LeadershipImportService();
