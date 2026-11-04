import { logger } from '@/config/logger';
import { prisma } from '@/database';
import { emailService } from '@/services/email';
import type { AuthorizedUser } from '@/types';
import { ForbiddenError, NotFoundError, ValidationError } from '@/types/errors';
import { savedReportRepository as repository } from '../repository/saved';
import type { CreateSavedReportInput, ReportParams, RunReportInput, UpdateSavedReportInput } from '../types/saved';
import { REPORT_CATALOG } from '../types/saved';
import { catalogEntry, reportRunner } from './runner';

const MANAGE_ALL = 'report:saved:manage_all';
const MAX_CONSECUTIVE_FAILURES = 5;

type Saved = NonNullable<Awaited<ReturnType<typeof repository.find>>>;
export type Delivered = { file: { filename: string; mimeType: string; content: string | Buffer; format: string }; executionId: string };

/** The next 06:00 UTC slot: tomorrow, the coming Monday, or the 1st of next month. */
export function nextRunAfter(schedule: string, from: Date): Date | null {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth();
  const d = from.getUTCDate();
  if (schedule === 'DAILY') return new Date(Date.UTC(y, m, d + 1, 6));
  if (schedule === 'WEEKLY') return new Date(Date.UTC(y, m, d + (((8 - from.getUTCDay()) % 7) || 7), 6));
  if (schedule === 'MONTHLY') return new Date(Date.UTC(y, m + 1, 1, 6));
  return null;
}

const asRecipients = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);

export class SavedReportService {
  catalog(user: AuthorizedUser) {
    return REPORT_CATALOG.map((r) => ({ ...r, allowed: user.permissions.includes(r.permission) }));
  }

  async list(user: AuthorizedUser, mineOnly: boolean) {
    const rows = await repository.list(user.churchId, user.id, mineOnly, user.permissions.includes(MANAGE_ALL));
    // Hide shared reports the viewer could not run anyway.
    return rows.filter((r) => r.createdBy === user.id || user.permissions.includes(MANAGE_ALL) || this.canRun(user, r.reportType));
  }

  async get(user: AuthorizedUser, id: string) {
    return this.visible(user, id);
  }

  async create(user: AuthorizedUser, input: CreateSavedReportInput) {
    this.assertCanUse(user, input.reportType);
    this.assertScheduleValid(input.schedule, input.format, input.recipients);
    await this.assertRecipients(user, input.reportType, input.recipients);
    const saved = await repository.create({
      churchId: user.churchId, createdBy: user.id, name: input.name, description: input.description ?? null, reportType: input.reportType,
      parameters: input.parameters as object, format: input.format, visibility: input.visibility, schedule: input.schedule, recipients: input.recipients,
      nextRunAt: nextRunAfter(input.schedule, new Date()),
    });
    await this.audit(user, 'SAVED_REPORT_CREATED', saved.id, { reportType: input.reportType, schedule: input.schedule });
    return saved;
  }

  async update(user: AuthorizedUser, id: string, input: UpdateSavedReportInput) {
    const saved = await this.visible(user, id);
    this.assertCanEdit(user, saved);
    const reportType = input.reportType ?? saved.reportType;
    const schedule = input.schedule ?? saved.schedule;
    const format = input.format ?? saved.format;
    const recipients = input.recipients ?? asRecipients(saved.recipients);
    this.assertCanUse(user, reportType);
    this.assertScheduleValid(schedule, format, recipients);
    await this.assertRecipients(user, reportType, recipients);

    const scheduleChanged = input.schedule !== undefined && input.schedule !== saved.schedule;
    const reactivated = input.isActive === true && !saved.isActive;
    const updated = await repository.update(id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.reportType !== undefined ? { reportType: input.reportType } : {}),
      ...(input.parameters !== undefined ? { parameters: input.parameters as object } : {}),
      ...(input.format !== undefined ? { format: input.format } : {}),
      ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
      ...(input.schedule !== undefined ? { schedule: input.schedule } : {}),
      ...(input.recipients !== undefined ? { recipients: input.recipients } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(scheduleChanged || reactivated ? { nextRunAt: nextRunAfter(schedule, new Date()) } : {}),
      ...(reactivated ? { failureCount: 0 } : {}),
    });
    await this.audit(user, 'SAVED_REPORT_UPDATED', id, { fields: Object.keys(input) });
    return updated;
  }

  async remove(user: AuthorizedUser, id: string) {
    const saved = await this.visible(user, id);
    this.assertCanEdit(user, saved);
    await repository.delete(id);
    await this.audit(user, 'SAVED_REPORT_DELETED', id, { name: saved.name });
    return { deleted: true };
  }

  /** Runs a saved report right now, as the signed-in user. */
  async runSaved(user: AuthorizedUser, id: string): Promise<Delivered> {
    const saved = await this.visible(user, id);
    return this.execute(user, { reportType: saved.reportType as RunReportInput['reportType'], parameters: saved.parameters as ReportParams, format: saved.format as RunReportInput['format'] }, 'MANUAL', saved.id);
  }

  async runAdhoc(user: AuthorizedUser, input: RunReportInput): Promise<Delivered> {
    return this.execute(user, input, 'ADHOC', null);
  }

  async executions(user: AuthorizedUser, query: { reportId?: string; skip: number; take: number }) {
    const all = user.permissions.includes(MANAGE_ALL);
    return repository.listExecutions(
      { churchId: user.churchId, ...(all ? {} : { requestedBy: user.id }), ...(query.reportId ? { reportId: query.reportId } : {}) },
      query.skip,
      query.take
    );
  }

  /** Runs one report and writes its execution record; the record exists even when the run fails. */
  async execute(user: AuthorizedUser, input: RunReportInput, trigger: 'ADHOC' | 'MANUAL' | 'SCHEDULED', reportId: string | null): Promise<Delivered> {
    const execution = await repository.createExecution({
      churchId: user.churchId, reportId, requestedBy: user.id, reportType: input.reportType, format: input.format, trigger,
    });
    try {
      const { report, rowCount } = await reportRunner.run(user, input.reportType, input.parameters, input.format);
      await repository.finishExecution(execution.id, {
        status: 'SUCCEEDED', rowCount, filename: report.filename, byteSize: Buffer.byteLength(report.content as string | Buffer),
      });
      return { file: { filename: report.filename, mimeType: report.mimeType, content: report.content, format: report.format }, executionId: execution.id };
    } catch (error) {
      await repository.finishExecution(execution.id, { status: 'FAILED', error: (error instanceof Error ? error.message : String(error)).slice(0, 500) }).catch(() => undefined);
      throw error;
    }
  }

  // ------------------------------------------------------------ scheduling

  /** Runs every report whose time has come. Safe to call from several workers: each run is claimed first. */
  async runDue(now = new Date()): Promise<{ ran: number; failed: number }> {
    let ran = 0;
    let failed = 0;
    for (const saved of await repository.due(now, 20)) {
      const claimed = await repository.claimRun(saved.id, saved.nextRunAt!, nextRunAfter(saved.schedule, now), now);
      if (claimed.count === 0) continue; // another worker took it
      const ok = await this.runScheduled(saved).catch((error) => {
        logger.error({ err: error, reportId: saved.id }, 'Scheduled report failed');
        return false;
      });
      ok ? ran++ : failed++;
    }
    return { ran, failed };
  }

  /** The owner's permissions are read fresh each time, so a demoted owner's schedule stops producing the report. */
  private async runScheduled(saved: Saved): Promise<boolean> {
    const [owner] = await repository.usersWithPermissions(saved.churchId, { id: saved.createdBy });
    let outcome: Error | null = null;
    try {
      if (!owner) throw new ForbiddenError('The owner of this report no longer has an account');
      const result = await this.execute(
        { id: owner.id, email: owner.email, churchId: owner.churchId, memberId: owner.memberId, permissions: owner.permissions },
        { reportType: saved.reportType as RunReportInput['reportType'], parameters: saved.parameters as ReportParams, format: saved.format as RunReportInput['format'] },
        'SCHEDULED',
        saved.id
      );
      await this.deliver(saved, result);
    } catch (error) {
      outcome = error instanceof Error ? error : new Error(String(error));
    }
    const after = await repository.recordOutcome(saved.id, outcome !== null);
    if (outcome && after.failureCount >= MAX_CONSECUTIVE_FAILURES) {
      await repository.update(saved.id, { isActive: false, nextRunAt: null });
      logger.warn({ reportId: saved.id }, 'Scheduled report switched off after repeated failures');
    }
    return outcome === null;
  }

  /** Only people who may see this report type get it by email, checked at send time rather than trusted from creation. */
  private async deliver(saved: Saved, { file }: Delivered): Promise<void> {
    const wanted = asRecipients(saved.recipients);
    if (wanted.length === 0) return;
    const entry = catalogEntry(saved.reportType);
    const eligible = (await repository.usersWithPermissions(saved.churchId, { emails: wanted })).filter((u) => entry && u.permissions.includes(entry.permission));
    for (const user of eligible) {
      await emailService.send({
        to: user.email,
        subject: `${saved.name} - scheduled report`,
        text: `Your scheduled report "${saved.name}" is attached.`,
        html: `<p>Your scheduled report <strong>${saved.name.replace(/[<>&]/g, '')}</strong> is attached.</p>`,
        attachments: [{ filename: file.filename, content: file.content, contentType: file.mimeType }],
      });
    }
  }

  // ------------------------------------------------------------ rules

  private canRun(user: AuthorizedUser, reportType: string): boolean {
    const entry = catalogEntry(reportType);
    return Boolean(entry && user.permissions.includes(entry.permission));
  }

  private assertCanUse(user: AuthorizedUser, reportType: string): void {
    const entry = catalogEntry(reportType);
    if (!entry) throw new ValidationError(`Unknown report type ${reportType}`);
    if (!user.permissions.includes(entry.permission)) throw new ForbiddenError(`Forbidden: ${entry.permission} permission required`);
  }

  private assertCanEdit(user: AuthorizedUser, saved: Saved): void {
    if (saved.createdBy !== user.id && !user.permissions.includes(MANAGE_ALL)) throw new ForbiddenError('Only the owner can change this report');
  }

  private assertScheduleValid(schedule: string, format: string, recipients: string[]): void {
    if (schedule === 'NONE') return;
    if (recipients.length === 0) throw new ValidationError('A scheduled report needs at least one recipient');
    if (format === 'JSON') throw new ValidationError('Scheduled reports are sent as PDF, CSV or XLSX');
  }

  /** Recipients must be users of this church who are themselves allowed to see this report type. */
  private async assertRecipients(user: AuthorizedUser, reportType: string, recipients: string[]): Promise<void> {
    if (recipients.length === 0) return;
    const entry = catalogEntry(reportType)!;
    const known = await repository.usersWithPermissions(user.churchId, { emails: recipients });
    const byEmail = new Map(known.map((u) => [u.email.toLowerCase(), u]));
    const unknown = recipients.filter((e) => !byEmail.has(e.toLowerCase()));
    if (unknown.length) throw new ValidationError(`Not users of this church: ${unknown.join(', ')}`);
    const denied = recipients.filter((e) => !byEmail.get(e.toLowerCase())!.permissions.includes(entry.permission));
    if (denied.length) throw new ValidationError(`These people are not allowed to see this report: ${denied.join(', ')}`);
  }

  private async visible(user: AuthorizedUser, id: string): Promise<Saved> {
    const saved = await repository.find(user.churchId, id);
    if (!saved) throw new NotFoundError('Saved report');
    const owner = saved.createdBy === user.id;
    const shared = saved.visibility === 'CHURCH' && this.canRun(user, saved.reportType);
    if (!owner && !shared && !user.permissions.includes(MANAGE_ALL)) throw new NotFoundError('Saved report');
    return saved;
  }

  private async audit(user: AuthorizedUser, action: string, entityId: string, details: Record<string, unknown>) {
    try {
      await prisma.auditLog.create({ data: { churchId: user.churchId, action, entityType: 'SAVED_REPORT', entityId, actorId: user.memberId ?? user.id, changes: JSON.stringify(details) } });
    } catch (error) {
      logger.error({ err: error, action }, 'Failed to write report audit log');
    }
  }
}

export const savedReportService = new SavedReportService();
