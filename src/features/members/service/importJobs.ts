import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/database';
import { logger } from '@/config/logger';
import type { AuthorizedUser } from '@/types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/types/errors';
import { parseCsv, toCsv } from './csv';
import { nextMembershipNumbers } from './membershipNumber';
import { TEMPLATE_COLUMNS, TEMPLATE_VERSION, findCandidates, mapHeader, nameKey, parseRow, type Candidate, type Parsed } from './importTemplate';

/**
 * Staged membership import. Behaviour, stated plainly:
 *  - Preview (`stage`) writes only MemberImportJob/Row. It never touches Member, accounts or finance.
 *  - Confirm is EXPLICIT PARTIAL SUCCESS: good rows are created, rejected rows are reported and left for correction,
 *    nothing is rolled back across batches. Each batch of rows is atomic and its rows are marked IMPORTED in the same
 *    transaction, so a retry or a second confirm skips everything already created.
 *  - Confirm is bounded (MAX_BATCHES_PER_CALL) and resumable: call it again until `remaining` is 0.
 */
export const MAX_ROWS = 5000;
const BATCH = 100;
const MAX_BATCHES_PER_CALL = 10;
const STALE_MS = 5 * 60 * 1000;

const need = (user: AuthorizedUser, permission = 'member:import') => {
  if (!user.permissions.includes(permission)) throw new ForbiddenError(`Forbidden: ${permission} permission required`);
};
const j = (v: unknown) => JSON.stringify(v);
const arr = (v: string | null | undefined): string[] => { try { return v ? (JSON.parse(v) as string[]) : []; } catch { return []; } };

export class ImportJobService {
  constructor(protected readonly kind: 'MEMBERS' | 'LEADERSHIP' = 'MEMBERS') {}

  template() { return { filename: `ecclesia-members-template-v${TEMPLATE_VERSION}.csv`, version: TEMPLATE_VERSION, csv: `${TEMPLATE_COLUMNS.join(',')}\r\n` }; }

  // ------------------------------------------------------------------ stage

  async stage(user: AuthorizedUser, csv: string, fileName: string) {
    this.guard(user);
    const contentHash = createHash('sha256').update(csv).digest('hex');
    // Uploading the same content again returns the same job instead of staging (and later importing) it twice.
    const same = await prisma.memberImportJob.findFirst({ where: { churchId: user.churchId, kind: this.kind, contentHash, status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'desc' } });
    if (same) return { ...(await this.summary(same)), reused: true };

    let table: string[][];
    try { table = parseCsv(csv); } catch (e) { throw new ValidationError(`The file is not valid CSV: ${(e as Error).message}`); }
    if (table.length < 2) throw new ValidationError('The file needs a header row and at least one member');
    if (table.length - 1 > MAX_ROWS) throw new ValidationError(`Too many rows (limit ${MAX_ROWS} per import)`);
    const header = mapHeader(table[0]);
    if (header.missing.length) throw new ValidationError(`The header row must include: ${header.missing.join(', ')}. Download the template for the exact columns.`);

    const [sections, orgs] = await Promise.all([
      prisma.section.findMany({ where: { churchId: user.churchId }, select: { id: true, name: true } }),
      prisma.organization.findMany({ where: { churchId: user.churchId, status: 'ACTIVE' }, select: { id: true, name: true, shortName: true } }),
    ]);
    const sectionByName = new Map(sections.map((s) => [nameKey(s.name), s.id]));
    const orgByName = new Map<string, string>();
    for (const o of orgs) { orgByName.set(nameKey(o.name), o.id); orgByName.set(nameKey(o.shortName), o.id); }

    const body = table.slice(1).map((cells, i) => {
      const raw: Record<string, string> = {};
      const mapped: Record<string, string> = {};
      table[0].forEach((h, c) => { raw[h.trim()] = cells[c] ?? ''; const k = header.columns[c]; if (k) mapped[k] = cells[c] ?? ''; });
      return { rowNumber: i + 2, raw, ...parseRow(mapped) };
    });

    const pool = await this.pool(user.churchId, body.map((b) => b.parsed).filter((p): p is Parsed => !!p));
    const earlier: Candidate[] = [];
    const rows: Prisma.MemberImportRowCreateManyInput[] = [];
    for (const b of body) {
      const errors = [...b.errors];
      const warnings = [...b.warnings];
      let status = 'VALID';
      let reason: string | null = null;
      let matches: unknown[] = [];
      if (b.parsed) {
        const p = b.parsed;
        if (p.sectionName && !sectionByName.has(nameKey(p.sectionName))) errors.push(`section: "${p.sectionName}" does not exist in this church`);
        for (const o of p.organizationNames) if (!orgByName.has(nameKey(o))) errors.push(`organization: "${o}" does not exist in this church`);
        if (!errors.length) {
          const found = findCandidates(p, pool.list);
          const emailHit = p.email ? pool.byEmail.get(p.email) : undefined;
          const existing = [...found.matches, ...(emailHit && !found.matches.some((m) => m.memberId === emailHit.id) ? [{ memberId: emailHit.id, membershipNumber: emailHit.membershipNumber, name: `${emailHit.firstName} ${emailHit.lastName}`, why: 'same email' }] : [])];
          warnings.push(...found.warnings);
          const inFile = findCandidates(p, earlier);
          if (existing.length) { status = 'REVIEW'; reason = 'POSSIBLE_MATCH'; matches = existing; }
          else if (inFile.matches.length) { status = 'REVIEW'; reason = 'DUPLICATE_IN_FILE'; matches = inFile.matches.map((m) => ({ ...m, name: `${m.name} (file row ${m.memberId.slice(4)})` })); }
          earlier.push({ id: `row:${b.rowNumber}`, membershipNumber: `row ${b.rowNumber}`, firstName: p.firstName, lastName: p.lastName, phone: p.phone });
        }
      }
      if (errors.length) status = 'REJECTED';
      rows.push({
        jobId: '', rowNumber: b.rowNumber, raw: j(b.raw), parsed: b.parsed && status !== 'REJECTED' ? j(b.parsed) : null, status, reason,
        errors: errors.length ? j(errors) : null, warnings: warnings.length ? j(warnings) : null, matches: matches.length ? j(matches) : null,
      });
    }

    const job = await prisma.$transaction(async (tx) => {
      const created = await tx.memberImportJob.create({ data: { kind: this.kind, churchId: user.churchId, fileName, templateVersion: TEMPLATE_VERSION, contentHash, totalRows: rows.length, createdBy: user.id } });
      for (let i = 0; i < rows.length; i += 500) await tx.memberImportRow.createMany({ data: rows.slice(i, i + 500).map((r) => ({ ...r, jobId: created.id })) });
      return created;
    });
    await this.audit(user, 'MEMBER_IMPORT_STAGED', job.id, { fileName, rows: rows.length });
    return { ...(await this.summary(job)), reused: false, ignoredColumns: header.ignored };
  }

  /** One query for all candidate people in this church, whatever the file size. */
  private async pool(churchId: string, parsed: Parsed[]) {
    const surnames = [...new Set(parsed.map((p) => p.lastName))];
    const emails = [...new Set(parsed.map((p) => p.email).filter((e): e is string => !!e))];
    if (!surnames.length && !emails.length) return { list: [] as Candidate[], byEmail: new Map<string, Candidate & { email: string }>() };
    const found = await prisma.member.findMany({
      where: { churchId, OR: [...(surnames.length ? [{ lastName: { in: surnames } }] : []), ...(emails.length ? [{ email: { in: emails } }] : [])] },
      select: { id: true, membershipNumber: true, firstName: true, lastName: true, phone: true, email: true },
    });
    return { list: found as Candidate[], byEmail: new Map(found.filter((m) => m.email).map((m) => [m.email!.toLowerCase(), m as Candidate & { email: string }])) };
  }

  // ---------------------------------------------------------------- summary

  async summary(job: { id: string; fileName: string; status: string; totalRows: number; templateVersion: string; createdAt: Date; finishedAt: Date | null }) {
    const groups = (await prisma.memberImportRow.groupBy({ by: ['status', 'decision'], where: { jobId: job.id }, _count: { _all: true } } as never)) as unknown as Array<{ status: string; decision: string | null; _count: { _all: number } }>;
    const n = (pred: (g: { status: string; decision: string | null }) => boolean) => groups.filter(pred).reduce((a, g) => a + g._count._all, 0);
    const imported = n((g) => g.status === 'IMPORTED');
    const skipped = n((g) => g.status === 'SKIPPED' || (g.status === 'REVIEW' && g.decision === 'SKIP'));
    const rejected = n((g) => g.status === 'REJECTED');
    const failed = n((g) => g.status === 'FAILED');
    const awaitingDecision = n((g) => g.status === 'REVIEW' && !g.decision);
    const readyToImport = n((g) => g.status === 'VALID' || (g.status === 'REVIEW' && (g.decision === 'CREATE' || !!g.decision?.startsWith('USE:'))));
    return {
      id: job.id, fileName: job.fileName, status: job.status, templateVersion: job.templateVersion, createdAt: job.createdAt, finishedAt: job.finishedAt,
      counts: { totalRows: job.totalRows, imported, skipped, rejected, failed, awaitingDecision, readyToImport },
      // Every source row lands in exactly one bucket; if this is false something is wrong and the job must not be reported as done.
      reconciles: imported + skipped + rejected + failed + awaitingDecision + readyToImport === job.totalRows,
      remaining: readyToImport + failed,
    };
  }

  protected guard(user: AuthorizedUser) { need(user, this.kind === 'LEADERSHIP' ? 'leadership:import' : 'member:import'); }

  protected async own(user: AuthorizedUser, jobId: string) {
    this.guard(user);
    const job = await prisma.memberImportJob.findUnique({ where: { id: jobId } });
    if (!job || job.churchId !== user.churchId || job.kind !== this.kind) throw new NotFoundError('Import');
    return job;
  }

  async get(user: AuthorizedUser, jobId: string) { return this.summary(await this.own(user, jobId)); }

  async rows(user: AuthorizedUser, jobId: string, query: { status?: string; page: number; pageSize: number }) {
    await this.own(user, jobId);
    const where: Prisma.MemberImportRowWhereInput = { jobId, ...(query.status ? { status: query.status } : {}) };
    const [rows, total] = await Promise.all([
      prisma.memberImportRow.findMany({ where, orderBy: { rowNumber: 'asc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      prisma.memberImportRow.count({ where }),
    ]);
    return {
      total,
      rows: rows.map((r) => ({
        rowNumber: r.rowNumber, status: r.status, reason: r.reason, decision: r.decision, original: JSON.parse(r.raw), errors: arr(r.errors), warnings: arr(r.warnings),
        matches: r.matches ? JSON.parse(r.matches) : [], memberId: r.memberId,
      })),
    };
  }

  /** Rejected and failed rows with their original values, ready to fix and re-upload. Cells are formula-safe. */
  async errorReport(user: AuthorizedUser, jobId: string) {
    const job = await this.own(user, jobId);
    const bad = await prisma.memberImportRow.findMany({ where: { jobId, status: { in: ['REJECTED', 'FAILED'] } }, orderBy: { rowNumber: 'asc' } });
    const cols = [...new Set(bad.flatMap((r) => Object.keys(JSON.parse(r.raw) as object)))];
    const csv = toCsv(['row', ...cols, 'problems'], bad.map((r) => { const o = JSON.parse(r.raw) as Record<string, string>; return [r.rowNumber, ...cols.map((c) => o[c] ?? ''), arr(r.errors).join('; ')]; }));
    return { filename: `import-${job.id}-problems.csv`, csv };
  }

  // --------------------------------------------------------------- decisions

  async decide(user: AuthorizedUser, jobId: string, decisions: { row: number; decision: 'CREATE' | 'SKIP' }[]) {
    const job = await this.own(user, jobId);
    if (!['PREVIEWED', 'PARTIAL'].includes(job.status)) throw new ConflictError(`An import that is ${job.status} cannot be changed`);
    let updated = 0;
    for (const decision of ['CREATE', 'SKIP'] as const) {
      const nums = decisions.filter((d) => d.decision === decision).map((d) => d.row);
      if (!nums.length) continue;
      // Only rows still awaiting review can be decided; imported or rejected rows are untouched.
      updated += (await prisma.memberImportRow.updateMany({ where: { jobId, rowNumber: { in: nums }, status: 'REVIEW' }, data: { decision } })).count;
    }
    await this.audit(user, 'MEMBER_IMPORT_DECISIONS', jobId, { requested: decisions.length, updated });
    return { updated, ignored: decisions.length - updated };
  }

  async cancel(user: AuthorizedUser, jobId: string) {
    const job = await this.own(user, jobId);
    const res = await prisma.memberImportJob.updateMany({ where: { id: jobId, status: 'PREVIEWED' }, data: { status: 'CANCELLED', finishedAt: new Date() } });
    if (res.count === 0) throw new ConflictError(`Only an import that has not started can be cancelled (this one is ${job.status})`);
    // Staged rows hold personal data nobody will use now.
    await prisma.memberImportRow.deleteMany({ where: { jobId } });
    await this.audit(user, 'MEMBER_IMPORT_CANCELLED', jobId, {});
    return { id: jobId, status: 'CANCELLED' };
  }

  // ----------------------------------------------------------------- confirm

  async confirm(user: AuthorizedUser, jobId: string, opts: { skipUnresolved: boolean }) {
    const job = await this.own(user, jobId);
    if (job.status === 'COMPLETED') return this.summary(job); // retry after success is a no-op
    if (!['PREVIEWED', 'PARTIAL', 'PROCESSING'].includes(job.status)) throw new ConflictError(`An import that is ${job.status} cannot be confirmed`);

    // Revalidate against the register as it is NOW: people may have been added since the preview.
    await this.revalidate(job.id, user.churchId);

    const awaiting = await prisma.memberImportRow.count({ where: { jobId, status: 'REVIEW', decision: null } });
    if (awaiting > 0 && !opts.skipUnresolved) throw new ConflictError(`${awaiting} row(s) need a decision (create or skip). Review them, or confirm with skipUnresolved to skip them. Nothing was imported.`);

    // Only one run at a time. A run that died (no heartbeat for 5 minutes) can be taken over.
    const claimed = await prisma.memberImportJob.updateMany({
      where: { id: jobId, OR: [{ status: { in: ['PREVIEWED', 'PARTIAL'] } }, { status: 'PROCESSING', heartbeatAt: { lt: new Date(Date.now() - STALE_MS) } }] },
      data: { status: 'PROCESSING', startedAt: job.startedAt ?? new Date(), heartbeatAt: new Date() },
    });
    if (claimed.count === 0) throw new ConflictError('This import is already being processed or has finished');
    await this.audit(user, 'MEMBER_IMPORT_CONFIRMED', jobId, { skipUnresolved: opts.skipUnresolved });

    try {
      if (awaiting > 0) await prisma.memberImportRow.updateMany({ where: { jobId, status: 'REVIEW', decision: null }, data: { decision: 'SKIP' } });
      await prisma.memberImportRow.updateMany({ where: { jobId, status: 'REVIEW', decision: 'SKIP' }, data: { status: 'SKIPPED' } });
      await this.process(job.id, user.churchId);
    } catch (error) {
      logger.error({ err: error, jobId }, 'Member import run failed');
      await prisma.memberImportJob.updateMany({ where: { id: jobId, status: 'PROCESSING' }, data: { status: 'PARTIAL' } });
      throw error;
    }

    const fresh = await prisma.memberImportJob.findUnique({ where: { id: jobId } });
    const summary = await this.summary(fresh!);
    const done = summary.remaining === 0 && summary.reconciles;
    await prisma.memberImportJob.updateMany({ where: { id: jobId, status: 'PROCESSING' }, data: { status: done ? 'COMPLETED' : 'PARTIAL', finishedAt: done ? new Date() : null } });
    if (done) await this.audit(user, 'MEMBER_IMPORT_FINISHED', jobId, summary.counts);
    return { ...summary, status: done ? 'COMPLETED' : 'PARTIAL' };
  }

  protected async revalidate(jobId: string, churchId: string) {
    const valid = await prisma.memberImportRow.findMany({ where: { jobId, status: 'VALID' }, select: { id: true, rowNumber: true, parsed: true } });
    if (!valid.length) return;
    const parsed = valid.map((r) => ({ id: r.id, p: JSON.parse(r.parsed!) as Parsed }));
    const pool = await this.pool(churchId, parsed.map((x) => x.p));
    let changed = 0;
    for (const { id, p } of parsed) {
      const found = findCandidates(p, pool.list);
      const emailHit = p.email ? pool.byEmail.get(p.email) : undefined;
      const matches = [...found.matches, ...(emailHit && !found.matches.some((m) => m.memberId === emailHit.id) ? [{ memberId: emailHit.id, membershipNumber: emailHit.membershipNumber, name: `${emailHit.firstName} ${emailHit.lastName}`, why: 'same email' }] : [])];
      if (!matches.length) continue;
      await prisma.memberImportRow.updateMany({ where: { id, status: 'VALID' }, data: { status: 'REVIEW', reason: 'POSSIBLE_MATCH', matches: j(matches), decision: null } });
      changed += 1;
    }
    if (changed) throw new ConflictError(`${changed} row(s) now match people added since the preview. Review them and confirm again. Nothing was imported.`);
  }

  protected async process(jobId: string, churchId: string) {
    const [sections, orgs] = await Promise.all([
      prisma.section.findMany({ where: { churchId }, select: { id: true, name: true } }),
      prisma.organization.findMany({ where: { churchId, status: 'ACTIVE' }, select: { id: true, name: true, shortName: true } }),
    ]);
    const sectionByName = new Map(sections.map((s) => [nameKey(s.name), s.id]));
    const orgByName = new Map<string, string>();
    for (const o of orgs) { orgByName.set(nameKey(o.name), o.id); orgByName.set(nameKey(o.shortName), o.id); }

    let cursor = 0;
    for (let b = 0; b < MAX_BATCHES_PER_CALL; b += 1) {
      // VALID/CREATE rows are new work; FAILED rows from an earlier attempt are retried. IMPORTED rows are never selected again.
      const batch = await prisma.memberImportRow.findMany({
        where: { jobId, rowNumber: { gt: cursor }, OR: [{ status: 'VALID' }, { status: 'REVIEW', decision: 'CREATE' }, { status: 'FAILED' }] },
        orderBy: { rowNumber: 'asc' }, take: BATCH,
      });
      if (!batch.length) return;
      cursor = batch[batch.length - 1].rowNumber;
      await prisma.memberImportJob.update({ where: { id: jobId }, data: { heartbeatAt: new Date() } });

      let attempt = 0;
      for (;;) {
        attempt += 1;
        const numbers = await nextMembershipNumbers(batch.length);
        try {
          await prisma.$transaction(async (tx) => {
            for (const [i, row] of batch.entries()) {
              const p = JSON.parse(row.parsed!) as Parsed;
              const sectionId = p.sectionName ? sectionByName.get(nameKey(p.sectionName)) : null;
              const orgIds = p.organizationNames.map((o) => orgByName.get(nameKey(o)));
              if ((p.sectionName && !sectionId) || orgIds.some((o) => !o)) throw new RowProblem(row.id, 'a section or organisation no longer exists');
              const member = await tx.member.create({
                data: {
                  churchId, sectionId: sectionId ?? null, firstName: p.firstName, middleName: p.middleName, lastName: p.lastName, phone: p.phone, email: p.email,
                  gender: p.gender, maritalStatus: p.maritalStatus, address: p.address, dateOfBirth: p.dateOfBirth ? new Date(`${p.dateOfBirth}T00:00:00.000Z`) : null,
                  membershipNumber: numbers[i], membershipStatus: 'ACTIVE',
                },
              });
              if (orgIds.length) await tx.organizationMembership.createMany({ data: [...new Set(orgIds as string[])].map((organizationId) => ({ organizationId, memberId: member.id })) });
              // Same transaction as the member, so "created" and "marked imported" can never disagree.
              await tx.memberImportRow.update({ where: { id: row.id }, data: { status: 'IMPORTED', memberId: member.id } });
            }
          });
          break;
        } catch (error) {
          // Two imports can draw the same next membership number; draw again.
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && attempt < 3) continue;
          const message = error instanceof RowProblem ? error.message : 'could not be saved; try confirming again';
          const ids = error instanceof RowProblem ? [error.rowId] : batch.map((r) => r.id);
          logger.error({ err: error, jobId }, 'Member import batch failed');
          await prisma.memberImportRow.updateMany({ where: { id: { in: ids } }, data: { status: 'FAILED', errors: j([message]) } });
          break;
        }
      }
    }
  }

  protected async audit(user: AuthorizedUser, action: string, entityId: string, details: Record<string, unknown>) {
    try {
      await prisma.auditLog.create({ data: { churchId: user.churchId, action, entityType: 'MEMBER_IMPORT', entityId, actorId: user.memberId ?? user.id, changes: j(details) } });
    } catch (error) {
      logger.error({ err: error, action }, 'Failed to write import audit log');
    }
  }
}

class RowProblem extends Error {
  constructor(public readonly rowId: string, message: string) { super(message); }
}

export const importJobService = new ImportJobService();
