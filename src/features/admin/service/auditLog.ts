import type { AuthorizedUser } from '@/types';
import { ValidationError } from '@/types/errors';
import { adminRepository as repository } from '../repository';
import type { AuditQuery } from '../types';
import { audit, require } from './common';

const MAX_EXPORT_ROWS = 10_000;
const DAY = 24 * 60 * 60 * 1000;

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value);
  // A leading = + - @ makes spreadsheet apps run the cell as a formula.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export class AuditLogService {
  async list(user: AuthorizedUser, query: AuditQuery) {
    require(user, 'admin:audit:view');
    const { items, total } = await repository.listAudit(this.where(user, query), query.skip, query.take);
    const names = items.length ? await repository.actorNames(user.churchId, [...new Set(items.map((i) => i.actorId))]) : new Map<string, string>();
    return { items: items.map((i) => ({ ...i, actorName: names.get(i.actorId) ?? null })), total };
  }

  /** The export is itself recorded, because it moves the whole trail out of the system. */
  async exportCsv(user: AuthorizedUser, query: AuditQuery): Promise<{ filename: string; csv: string; truncated: boolean }> {
    require(user, 'admin:audit:view');
    if (!query.from || !query.to) throw new ValidationError('Choose a start and end date to export');
    if (query.to.getTime() - query.from.getTime() > 366 * DAY) throw new ValidationError('Export a year or less at a time');
    const { items, total } = await repository.listAudit(this.where(user, query), 0, MAX_EXPORT_ROWS);
    const names = items.length ? await repository.actorNames(user.churchId, [...new Set(items.map((i) => i.actorId))]) : new Map<string, string>();
    const header = ['timestamp', 'action', 'entityType', 'entityId', 'actorId', 'actorName', 'changes', 'reason'];
    const lines = items.map((i) => [i.timestamp.toISOString(), i.action, i.entityType, i.entityId, i.actorId, names.get(i.actorId) ?? '', i.changes ?? '', i.reason ?? ''].map(csvCell).join(','));
    await audit(user, 'AUDIT_LOG_EXPORTED', 'AUDIT_LOG', user.churchId, { rows: items.length, from: query.from, to: query.to });
    return { filename: `audit-log-${query.from.toISOString().slice(0, 10)}-to-${query.to.toISOString().slice(0, 10)}.csv`, csv: [header.join(','), ...lines].join('\n'), truncated: total > items.length };
  }

  private where(user: AuthorizedUser, q: AuditQuery) {
    return {
      churchId: user.churchId,
      ...(q.action ? { action: q.action } : {}),
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.from || q.to ? { timestamp: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
    };
  }
}

export const auditLogService = new AuditLogService();
