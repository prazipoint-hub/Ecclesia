import { Prisma } from '@prisma/client';
import { prisma } from '@/database';
import { logger } from '@/config/logger';
import type { AuthorizedUser } from '@/types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/types/errors';
import { directoryRepository as repository } from '../repository/directory';
import { DirectoryQuery, ImportRowSchema, type ImportRow } from '../types/directory';
import { parseCsv, toCsv } from './csv';
import { nextMembershipNumbers } from './membershipNumber';

const MAX_IMPORT_ROWS = 5000;
const MAX_EXPORT_ROWS = 20000;
const HEADER_ALIASES: Record<string, keyof ImportRow> = {
  firstname: 'firstName', middlename: 'middleName', lastname: 'lastName', gender: 'gender', dateofbirth: 'dateOfBirth', dob: 'dateOfBirth',
  phone: 'phone', email: 'email', address: 'address', section: 'section', membershipstatus: 'membershipStatus', status: 'membershipStatus',
  maritalstatus: 'maritalStatus', membershipdate: 'membershipDate',
};

export type RowError = { row: number; message: string };
export type ImportPlan = {
  totalRows: number;
  valid: Prisma.MemberCreateManyInput[];
  errors: RowError[];
  ignoredColumns: string[];
};

function require(user: AuthorizedUser, permission: string): void {
  if (!user.permissions.includes(permission)) throw new ForbiddenError(`Forbidden: ${permission} permission required`);
}

export class DirectoryService {
  // ------------------------------------------------------------------ search

  private where(churchId: string, q: DirectoryQuery): Prisma.MemberWhereInput {
    const tokens = (q.q ?? '').split(/\s+/).filter(Boolean).slice(0, 5);
    return {
      churchId,
      ...(q.sectionId && { sectionId: q.sectionId }),
      ...(q.status && { membershipStatus: q.status }),
      ...(q.gender && { gender: q.gender }),
      ...(q.archived === 'exclude' && { archivedAt: null }),
      ...(q.archived === 'only' && { archivedAt: { not: null } }),
      // Every word must match somewhere, so "ada moyo" finds Ada Moyo but not every Ada.
      ...(tokens.length && {
        AND: tokens.map((token) => ({
          OR: [
            { firstName: { contains: token } }, { middleName: { contains: token } }, { lastName: { contains: token } },
            { email: { contains: token } }, { phone: { contains: token } }, { membershipNumber: { contains: token } },
          ],
        })),
      }),
    };
  }

  async search(user: AuthorizedUser, query: DirectoryQuery) {
    require(user, 'member:view');
    const orderBy: Prisma.MemberOrderByWithRelationInput[] = query.sort === 'joined' ? [{ joinDate: 'desc' }, { id: 'asc' }] : [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }];
    const [rows, total] = await repository.search(this.where(user.churchId, query), orderBy, (query.page - 1) * query.pageSize, query.pageSize);
    return {
      items: rows.map(({ section, ...m }) => ({ ...m, sectionName: section?.name ?? null })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  // ------------------------------------------------------------------ export

  async exportCsv(user: AuthorizedUser, query: DirectoryQuery): Promise<{ filename: string; csv: string }> {
    require(user, 'member:export');
    const rows = await repository.listForExport(this.where(user.churchId, query), MAX_EXPORT_ROWS + 1);
    if (rows.length > MAX_EXPORT_ROWS) throw new ValidationError(`Too many members to export at once (limit ${MAX_EXPORT_ROWS}); narrow the filters`);
    const csv = toCsv(
      ['membershipNumber', 'firstName', 'middleName', 'lastName', 'gender', 'dateOfBirth', 'phone', 'email', 'address', 'section', 'membershipStatus', 'maritalStatus', 'membershipDate', 'archived'],
      rows.map((m) => [m.membershipNumber, m.firstName, m.middleName, m.lastName, m.gender, m.dateOfBirth, m.phone, m.email, m.address, m.section?.name, m.membershipStatus, m.maritalStatus, m.membershipDate, m.archivedAt ? 'yes' : 'no'])
    );
    await this.audit(user, 'MEMBER_EXPORTED', user.churchId, { rows: rows.length, filters: { ...query, page: undefined, pageSize: undefined } });
    return { filename: `members-${new Date().toISOString().slice(0, 10)}.csv`, csv };
  }

  // ------------------------------------------------------------------ import

  /** Validates a CSV without writing anything, so the admin can fix problems first. */
  async planImport(user: AuthorizedUser, csv: string): Promise<ImportPlan> {
    require(user, 'member:import');
    let table: string[][];
    try {
      table = parseCsv(csv);
    } catch (error) {
      throw new ValidationError(`The file is not valid CSV: ${(error as Error).message}`);
    }
    if (table.length < 2) throw new ValidationError('The file needs a header row and at least one member');
    if (table.length - 1 > MAX_IMPORT_ROWS) throw new ValidationError(`Too many rows (limit ${MAX_IMPORT_ROWS} per import)`);

    const header = table[0].map((h) => h.trim().toLowerCase().replace(/[\s_-]/g, ''));
    const columns = header.map((h) => HEADER_ALIASES[h]);
    const ignoredColumns = table[0].filter((_h, i) => !columns[i]).map((h) => h.trim());
    if (!columns.includes('firstName') || !columns.includes('lastName')) throw new ValidationError('The header row must include firstName and lastName columns');

    const sections = new Map((await repository.listSections(user.churchId)).map((s) => [s.name.trim().toLowerCase(), s.id]));
    const errors: RowError[] = [];
    const parsed: { row: number; data: ImportRow; sectionId: string | null }[] = [];

    table.slice(1).forEach((cells, index) => {
      const row = index + 2; // 1-based, header is row 1
      const raw: Record<string, string> = {};
      columns.forEach((column, i) => { if (column && cells[i] !== undefined) raw[column] = cells[i]; });
      const result = ImportRowSchema.safeParse(raw);
      if (!result.success) {
        errors.push({ row, message: result.error.issues.map((i) => `${i.path.join('.') || 'row'}: ${i.message}`).join('; ') });
        return;
      }
      let sectionId: string | null = null;
      if (result.data.section) {
        sectionId = sections.get(result.data.section.toLowerCase()) ?? null;
        if (!sectionId) { errors.push({ row, message: `section: "${result.data.section}" does not exist` }); return; }
      }
      parsed.push({ row, data: result.data, sectionId });
    });

    // Duplicates: inside the file, and against members already in this church.
    const existing = await repository.findExisting(
      user.churchId,
      [...new Set(parsed.map((p) => p.data.email).filter((e): e is string => !!e))],
      [...new Set(parsed.map((p) => p.data.dateOfBirth?.getTime()).filter((t): t is number => t !== undefined))].map((t) => new Date(t))
    );
    const existingEmails = new Set(existing.map((m) => m.email?.toLowerCase()).filter(Boolean));
    const existingPeople = new Set(existing.filter((m) => m.dateOfBirth).map((m) => `${m.firstName}|${m.lastName}|${m.dateOfBirth!.getTime()}`.toLowerCase()));
    const seenEmails = new Set<string>();
    const seenPeople = new Set<string>();
    const valid: Prisma.MemberCreateManyInput[] = [];

    for (const { row, data, sectionId } of parsed) {
      const person = data.dateOfBirth ? `${data.firstName}|${data.lastName}|${data.dateOfBirth.getTime()}`.toLowerCase() : null;
      if (data.email && (existingEmails.has(data.email) || seenEmails.has(data.email))) {
        errors.push({ row, message: `email: ${data.email} is already used by another member or an earlier row` });
        continue;
      }
      if (person && (existingPeople.has(person) || seenPeople.has(person))) {
        errors.push({ row, message: 'possible duplicate: a member with the same name and date of birth already exists' });
        continue;
      }
      if (data.email) seenEmails.add(data.email);
      if (person) seenPeople.add(person);
      valid.push({
        churchId: user.churchId, sectionId, firstName: data.firstName, middleName: data.middleName ?? null, lastName: data.lastName,
        gender: data.gender ?? null, dateOfBirth: data.dateOfBirth ?? null, phone: data.phone ?? null, email: data.email ?? null,
        address: data.address ?? null, membershipStatus: data.membershipStatus, maritalStatus: data.maritalStatus ?? null,
        membershipDate: data.membershipDate ?? new Date(), membershipNumber: '',
      });
    }

    errors.sort((a, b) => a.row - b.row);
    return { totalRows: table.length - 1, valid, errors, ignoredColumns };
  }

  async previewImport(user: AuthorizedUser, csv: string) {
    const plan = await this.planImport(user, csv);
    return {
      totalRows: plan.totalRows,
      validRows: plan.valid.length,
      errorCount: plan.errors.length,
      errors: plan.errors.slice(0, 100),
      ignoredColumns: plan.ignoredColumns,
    };
  }

  async runImport(user: AuthorizedUser, csv: string, fileName: string, skipInvalid: boolean) {
    const plan = await this.planImport(user, csv);
    if (plan.errors.length > 0 && !skipInvalid) {
      throw new ConflictError(`${plan.errors.length} row(s) have problems. Fix them, or re-run allowing invalid rows to be skipped. Nothing was imported.`);
    }

    let imported = 0;
    if (plan.valid.length > 0) {
      const numbers = await nextMembershipNumbers(plan.valid.length);
      const rows = plan.valid.map((row, i) => ({ ...row, membershipNumber: numbers[i] }));
      for (let i = 0; i < rows.length; i += 200) {
        const result = await repository.createMany(rows.slice(i, i + 200));
        imported += result.count;
      }
    }

    const status = plan.errors.length === 0 ? 'COMPLETED' : imported > 0 ? 'PARTIAL' : 'FAILED';
    const record = await repository.recordImport({
      churchId: user.churchId, fileName, createdBy: user.id, status, totalRows: plan.totalRows, imported, skipped: plan.errors.length,
      errorLog: plan.errors.length ? JSON.stringify(plan.errors.slice(0, 500)) : null,
    });
    await this.audit(user, 'MEMBER_IMPORTED', record.id, { fileName, imported, skipped: plan.errors.length });
    return { id: record.id, status, totalRows: plan.totalRows, imported, skipped: plan.errors.length, errors: plan.errors.slice(0, 100) };
  }

  async listImports(user: AuthorizedUser) {
    require(user, 'member:import');
    return (await repository.listImports(user.churchId, 20)).map((i) => ({ ...i, errorLog: undefined }));
  }

  // ----------------------------------------------------------------- archive

  async archive(user: AuthorizedUser, memberId: string) {
    require(user, 'member:archive');
    const member = await this.ownedMember(user, memberId);
    if (member.id === user.memberId) throw new ConflictError('You cannot archive your own member record');
    if (member.archivedAt) throw new ConflictError('Member is already archived');
    const updated = await repository.setArchived(memberId, new Date(), user.id);
    // Cut off anyone currently signed in as this member.
    await repository.endSessionsForMember(memberId);
    await this.audit(user, 'MEMBER_ARCHIVED', memberId, {});
    return updated;
  }

  async restore(user: AuthorizedUser, memberId: string) {
    require(user, 'member:archive');
    const member = await this.ownedMember(user, memberId);
    if (!member.archivedAt) throw new ConflictError('Member is not archived');
    const updated = await repository.setArchived(memberId, null, null);
    await this.audit(user, 'MEMBER_RESTORED', memberId, {});
    return updated;
  }

  private async ownedMember(user: AuthorizedUser, memberId: string) {
    const member = await repository.findMember(memberId);
    if (!member || member.churchId !== user.churchId) throw new NotFoundError('Member');
    return member;
  }

  private async audit(user: AuthorizedUser, action: string, entityId: string, details: Record<string, unknown>) {
    try {
      await prisma.auditLog.create({
        data: { churchId: user.churchId, action, entityType: 'MEMBER', entityId, actorId: user.memberId ?? user.id, changes: JSON.stringify(details) },
      });
    } catch (error) {
      logger.error({ err: error, action }, 'Failed to write member audit log');
    }
  }
}

export const directoryService = new DirectoryService();
