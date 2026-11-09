import jwt from 'jsonwebtoken';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { createMockPrisma } from './helpers/mockPrisma';

const mocked = vi.hoisted(() => ({ prisma: undefined as unknown }));
vi.mock('@/database', async () => {
  const { createMockPrisma: create } = await import('./helpers/mockPrisma');
  mocked.prisma = create();
  return { prisma: mocked.prisma, default: mocked.prisma };
});

import { createApp } from '@/app';
import { jwtSecret } from '@/config/secrets';
import { CATALOGUE, keyOf } from '@/features/leadership/service/catalogue';
import { appointmentService, exclusiveEnd, isEffective } from '@/features/leadership/service/appointments';

const prisma = mocked.prisma as ReturnType<typeof createMockPrisma>;
const app = createApp();
const as = (userId: string, ...permissions: string[]) => ({
  Authorization: `Bearer ${jwt.sign({ sub: userId, email: 'u@example.com', churchId: 'church-1', memberId: `m-${userId}`, permissions, sessionId: 's1', tokenId: 't1' }, jwtSecret, { expiresIn: '5m' })}`,
});
const base = '/api/v2/leadership-register';
const HEADER = 'name,surname,phone,leadership_role,committee_or_board,department,organization,section,term_start,term_end,appointment_status';
const put = (csv: string, perms = ['leadership:import']) => request(app).post(`${base}/import?fileName=l.csv`).set(as('u1', ...perms)).set('Content-Type', 'text/csv').send(csv);

const pos = (name: string, over: Record<string, unknown> = {}) => {
  const c = CATALOGUE.find((p) => p.name === name)!;
  return { id: `pos-${c.code}`, churchId: 'church-1', code: c.code, name: c.name, groupName: c.groupName, scopeKind: c.scopeKind, aliases: c.aliases.length ? JSON.stringify(c.aliases) : null, allowMultiple: true, active: true, mappedRoleId: null, ...over };
};
const person = (id: string, first: string, last: string, over: Record<string, unknown> = {}) => ({ id, firstName: first, lastName: last, phone: null, membershipNumber: `M-${id}`, membershipStatus: 'ACTIVE', archivedAt: null, ...over });

beforeEach(() => {
  vi.resetAllMocks();
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.auditLog.create.mockResolvedValue({});
  prisma.$transaction.mockImplementation((async (arg: unknown) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg as unknown[]))) as never);
  prisma.positionDefinition.findMany.mockResolvedValue(CATALOGUE.map((c) => pos(c.name)));
  prisma.positionDefinition.createMany.mockResolvedValue({ count: 0 });
  prisma.section.findMany.mockResolvedValue([{ id: 'sec1', name: 'North' }]);
  prisma.organization.findMany.mockResolvedValue([{ id: 'o1', name: 'United Methodist Youth Fellowship', shortName: 'UMYF' }]);
  prisma.committee.findMany.mockResolvedValue([{ id: 'com1', name: 'Finance Committee' }]);
  prisma.member.findMany.mockResolvedValue([person('a', 'Ruth', 'Moyo')]);
  prisma.role.findMany.mockResolvedValue([]);
  prisma.appointment.findMany.mockResolvedValue([]);
  prisma.memberImportJob.findFirst.mockResolvedValue(null);
  prisma.memberImportJob.create.mockResolvedValue({ id: 'job1', fileName: 'l.csv', status: 'PREVIEWED', totalRows: 0, templateVersion: '1.0', createdAt: new Date(), finishedAt: null });
  prisma.memberImportRow.createMany.mockResolvedValue({ count: 0 });
  prisma.memberImportRow.groupBy.mockResolvedValue([]);
});

describe('position catalogue', () => {
  test('covers the source list plus Pastor, Finance Secretary and organisation positions, with no duplicate codes or keys', () => {
    const names = CATALOGUE.map((c) => c.name);
    for (const n of ['Pastor', 'Finance Secretary', 'Lay Leader', 'Chief Recording Secretary', 'Treasurer', 'Audit Chairperson', 'Delegate 1', 'Alternate Delegate 2', 'Chief Bible Reader', 'Organization Treasurer', 'Organization Finance Secretary', 'Organization Committee Member']) expect(names).toContain(n);
    expect(new Set(CATALOGUE.map((c) => c.code)).size).toBe(CATALOGUE.length);
    expect(new Set(CATALOGUE.map((c) => keyOf(c.name))).size).toBe(CATALOGUE.length);
    // Church Secretary-style roles stay distinct: no Secretary position was merged into another.
    expect(['Council Secretary', 'Recording Secretary', 'Finance Secretary', 'BOT Secretary'].every((n) => names.includes(n))).toBe(true);
    expect(CATALOGUE.filter((c) => c.scopeKind === 'ORGANIZATION')).toHaveLength(12);
  });

  test('ensure adds only what is missing', async () => {
    prisma.positionDefinition.findMany.mockResolvedValueOnce([pos('Pastor')]);
    const res = await request(app).get(`${base}/positions`).set(as('u1', 'leadership:position:view'));
    expect(res.status).toBe(200);
    const created = prisma.positionDefinition.createMany.mock.calls[0][0].data as Array<{ code: string }>;
    expect(created.some((c) => c.code === 'PASTOR')).toBe(false);
    expect(created.length).toBe(CATALOGUE.length - 1);
    expect((await request(app).get(`${base}/positions`).set(as('u1'))).status).toBe(403);
  });
});

describe('position → access mapping', () => {
  const role = (churchId: string, ...perms: string[]) => ({ id: 'r1', churchId, permissions: perms.map((name) => ({ permission: { name } })) });
  const map = (perms: string[], roleId: string | null = 'r1') => request(app).put(`${base}/positions/TREASURER/mapping`).set(as('u1', ...perms)).send({ roleId });
  beforeEach(() => { prisma.positionDefinition.findUnique.mockResolvedValue(pos('Treasurer')); prisma.positionDefinition.update.mockResolvedValue({}); });

  test('refuses platform/higher-scope power, foreign roles, and permissions the mapper does not hold', async () => {
    prisma.role.findUnique.mockResolvedValue(role('church-1', 'access:assign:global'));
    expect((await map(['leadership:position:manage', 'access:assign:global'])).status).toBe(400);
    prisma.role.findUnique.mockResolvedValue(role('church-1', 'circuit:register'));
    expect((await map(['leadership:position:manage', 'circuit:register'])).status).toBe(400);
    prisma.role.findUnique.mockResolvedValue(role('other-church', 'finance:view'));
    expect((await map(['leadership:position:manage'])).status).toBe(404);
    prisma.role.findUnique.mockResolvedValue(role('church-1', 'finance:view'));
    expect((await map(['leadership:position:manage'])).status).toBe(403);
    expect(prisma.positionDefinition.update).not.toHaveBeenCalled();
    expect((await map(['leadership:position:manage', 'finance:view'])).status).toBe(200);
    expect((await map(['leadership:position:manage'], null)).status).toBe(200);
  });
});

describe('appointment effectiveness and the term boundary', () => {
  const at = new Date('2026-06-15T12:00:00Z');
  test('future, pending, revoked and expired appointments are not in force; an inclusive end date lasts the whole day', () => {
    const a = (status: string, s: string, e: string | null) => ({ status, termStart: new Date(s), termEnd: e ? new Date(e) : null });
    expect(isEffective(a('ACTIVE', '2026-01-01', null), at)).toBe(true);
    expect(isEffective(a('ACTIVE', '2026-07-01', null), at)).toBe(false);
    expect(isEffective(a('PENDING', '2026-01-01', null), at)).toBe(false);
    expect(isEffective(a('REVOKED', '2026-01-01', null), at)).toBe(false);
    expect(isEffective(a('ACTIVE', '2026-01-01', '2026-06-15T00:00:00Z'), at)).toBe(false);
    const end = exclusiveEnd('2026-06-15'); // "ends 15 June" inclusive
    expect(end.toISOString()).toBe('2026-06-16T00:00:00.000Z');
    expect(isEffective(a('ACTIVE', '2026-01-01', end.toISOString()), at)).toBe(true);
    expect(isEffective(a('ACTIVE', '2026-01-01', end.toISOString()), new Date('2026-06-16T00:00:00Z'))).toBe(false);
  });
});

describe('derived grants', () => {
  const appt = (id: string, over: Record<string, unknown> = {}) => ({ id, memberId: 'mem1', scopeType: 'CHURCH', scopeId: 'church-1', termStart: new Date('2026-01-01'), termEnd: new Date('2026-12-31'), createdBy: 'maker', approvedBy: 'checker', position: { mappedRoleId: 'role1' }, ...over });

  test('one grant per mapped appointment, carrying the appointment dates; unmapped positions and members without accounts get nothing', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user1', disabledAt: null });
    prisma.appointment.findMany.mockResolvedValue([appt('a1'), appt('a2', { position: { mappedRoleId: null } })]);
    prisma.scopedRoleAssignment.findFirst.mockResolvedValue(null);
    prisma.scopedRoleAssignment.create.mockResolvedValue({});
    expect(await appointmentService.syncGrantsForMember('mem1')).toBe(1);
    expect(prisma.scopedRoleAssignment.create.mock.calls[0][0].data).toMatchObject({ userId: 'user1', roleId: 'role1', scopeType: 'CHURCH', sourceType: 'APPOINTMENT', sourceId: 'a1', startsAt: new Date('2026-01-01'), endsAt: new Date('2026-12-31') });

    prisma.scopedRoleAssignment.create.mockClear();
    prisma.user.findUnique.mockResolvedValue(null);
    expect(await appointmentService.syncGrantsForMember('mem1')).toBe(0);
    expect(prisma.scopedRoleAssignment.create).not.toHaveBeenCalled();
  });

  test('syncing again changes nothing, and a concurrent duplicate is tolerated', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user1', disabledAt: null });
    prisma.appointment.findMany.mockResolvedValue([appt('a1')]);
    prisma.scopedRoleAssignment.findFirst.mockResolvedValue({ id: 'g1', roleId: 'role1', startsAt: new Date('2026-01-01'), endsAt: new Date('2026-12-31') });
    expect(await appointmentService.syncGrantsForMember('mem1')).toBe(0);
    expect(prisma.scopedRoleAssignment.create).not.toHaveBeenCalled();
    prisma.scopedRoleAssignment.findFirst.mockResolvedValue(null);
    prisma.scopedRoleAssignment.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 't' }));
    await expect(appointmentService.syncGrantsForMember('mem1')).resolves.toBe(0);
  });

  test('approval: the proposer cannot approve; a different approver activates it and grants access', async () => {
    const approve = (userId: string) => request(app).post(`${base}/appointments/a1/approve`).set(as(userId, 'leadership:appointment:approve'));
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', churchId: 'church-1', memberId: 'mem1', positionId: 'p', status: 'PENDING', createdBy: 'maker' });
    expect((await approve('maker')).status).toBe(403);
    expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
    prisma.appointment.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.findUnique.mockResolvedValue({ id: 'user1', disabledAt: null });
    prisma.appointment.findMany.mockResolvedValue([appt('a1')]);
    prisma.scopedRoleAssignment.findFirst.mockResolvedValue(null);
    prisma.scopedRoleAssignment.create.mockResolvedValue({});
    expect((await approve('checker')).status).toBe(200);
    expect(prisma.appointment.updateMany.mock.calls[0][0].where).toEqual({ id: 'a1', status: 'PENDING' });
    expect(prisma.scopedRoleAssignment.create).toHaveBeenCalledTimes(1);
    prisma.appointment.updateMany.mockResolvedValue({ count: 0 });
    expect((await approve('checker')).status).toBe(409); // already approved: no double approval
  });

  test('revoking removes only that appointment\'s grants and is tenant-scoped', async () => {
    const revoke = () => request(app).post(`${base}/appointments/a1/revoke`).set(as('u1', 'leadership:appointment:manage')).send({ reason: 'resigned' });
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', churchId: 'other', memberId: 'mem1', status: 'ACTIVE' });
    expect((await revoke()).status).toBe(404);
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', churchId: 'church-1', memberId: 'mem1', status: 'ACTIVE' });
    prisma.appointment.updateMany.mockResolvedValue({ count: 1 });
    prisma.scopedRoleAssignment.updateMany.mockResolvedValue({ count: 1 });
    const res = await revoke();
    expect(res.body).toMatchObject({ status: 'REVOKED', grantsRevoked: 1 });
    expect(prisma.scopedRoleAssignment.updateMany.mock.calls[0][0].where).toEqual({ sourceType: 'APPOINTMENT', sourceId: 'a1', revokedAt: null });
  });

  test('the register can be read as of a past date (history) and needs the view permission', async () => {
    prisma.appointment.findMany.mockResolvedValue([]);
    prisma.appointment.count.mockResolvedValue(0);
    expect((await request(app).get(`${base}/appointments`).set(as('u1'))).status).toBe(403);
    await request(app).get(`${base}/appointments?asOf=2025-03-01`).set(as('u1', 'leadership:appointment:view'));
    const where = prisma.appointment.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ churchId: 'church-1', status: { in: ['ACTIVE', 'ENDED'] }, termStart: { lte: new Date('2025-03-01') } });
    expect(where.OR).toEqual([{ termEnd: null }, { termEnd: { gt: new Date('2025-03-01') } }]);
  });
});

describe('leadership CSV preview', () => {
  const rowsOf = () => (prisma.memberImportRow.createMany.mock.calls[0][0].data as Array<{ status: string; reason?: string; errors?: string; warnings?: string; parsed?: string; matches?: string }>);
  const e = (r: { errors?: string }) => (r.errors ? (JSON.parse(r.errors) as string[]).join(' | ') : '');

  test('needs leadership:import and the required headings; template is the source header', async () => {
    expect((await put(`${HEADER}\nRuth,Moyo,,Lay Leader,,,,,2026-01-01,,`, [])).status).toBe(403);
    expect((await put('name,surname\nRuth,Moyo')).status).toBe(400);
    const t = await request(app).get(`${base}/import/template`).set(as('u1', 'leadership:import'));
    expect(t.text).toBe(`${HEADER}\r\n`);
  });

  test('matches existing members only: unmatched is rejected and no person, appointment or account is created', async () => {
    await put([HEADER, 'Ruth,Moyo,,Lay Leader,,,,,2026-01-01,2026-12-31,', 'Nobody,Here,,Lay Leader,,,,,2026-01-01,,', ''].join('\n'));
    const rows = rowsOf();
    expect(rows.map((r) => r.status)).toEqual(['VALID', 'REJECTED']);
    expect(e(rows[1])).toContain('never creates people');
    expect(prisma.member.create).not.toHaveBeenCalled();
    expect(prisma.appointment.create).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  test('inclusive end date is stored as an exclusive plan; bad dates, unknown position and bad status are rejected', async () => {
    await put([HEADER, 'Ruth,Moyo,,Lay Leader,,,,,2026-01-01,2026-12-31,', 'Ruth,Moyo,,Lay Leader,,,,,2026-13-01,,', 'Ruth,Moyo,,Supreme Ruler,,,,,2026-01-01,,', 'Ruth,Moyo,,Lay Leader,,,,,2026-05-01,2026-04-01,', 'Ruth,Moyo,,Lay Leader,,,,,2026-01-01,,REVOKED', ''].join('\n'));
    const rows = rowsOf();
    expect(JSON.parse(rows[0].parsed!)).toMatchObject({ termStart: '2026-01-01', termEnd: '2026-12-31', finalStatus: 'ACTIVE', scopeType: 'CHURCH', scopeId: 'church-1' });
    expect(e(rows[1])).toContain('term_start');
    expect(e(rows[2])).toContain('not a known position');
    expect(e(rows[3])).toContain('before term_start');
    expect(e(rows[4])).toContain('revoke appointments in the app');
  });

  test('a position with system access can never be imported as ACTIVE, and the preview shows the access it would give', async () => {
    prisma.positionDefinition.findMany.mockResolvedValue(CATALOGUE.map((c) => pos(c.name, c.name === 'Treasurer' ? { mappedRoleId: 'role-t' } : {})));
    prisma.role.findMany.mockResolvedValue([{ id: 'role-t', permissions: [{ permission: { name: 'finance:view' } }, { permission: { name: 'finance:receipt:create' } }] }]);
    await put([HEADER, 'Ruth,Moyo,,Treasurer,,,,,2026-01-01,,ACTIVE', ''].join('\n'));
    const r = rowsOf()[0];
    expect(JSON.parse(r.parsed!)).toMatchObject({ finalStatus: 'PENDING', grantsAfterApproval: ['finance:view', 'finance:receipt:create'] });
    expect(r.warnings).toContain('wait for approval');
    // The preview itself granted nothing.
    expect(prisma.scopedRoleAssignment.create).not.toHaveBeenCalled();
  });

  test('organisation positions need an existing organisation; general positions refuse one', async () => {
    await put([HEADER, 'Ruth,Moyo,,Organisation Secretary,,,UMYF,,2026-01-01,,', 'Ruth,Moyo,,Organization Secretary,,,,,2026-01-01,,', 'Ruth,Moyo,,Organization Secretary,,,Mystery,,2026-01-01,,', 'Ruth,Moyo,,Lay Leader,,,UMYF,,2026-01-01,,', ''].join('\n'));
    const rows = rowsOf();
    expect(JSON.parse(rows[0].parsed!)).toMatchObject({ scopeType: 'ORGANIZATION', scopeId: 'o1', positionCode: 'ORGANIZATION_SECRETARY' });
    expect(e(rows[1])).toContain('organization: required');
    expect(e(rows[2])).toContain('does not exist');
    expect(e(rows[3])).toContain('not an organisation position');
  });

  test('two people with one name are an ambiguity to resolve, phone can break the tie, member_number is exact', async () => {
    prisma.member.findMany.mockResolvedValue([person('a', 'Ruth', 'Moyo', { phone: '0771111111' }), person('b', 'Ruth', 'Moyo', { phone: '0772222222' })]);
    await put([HEADER, 'Ruth,Moyo,,Lay Leader,,,,,2026-01-01,,', 'Ruth,Moyo,077 222 2222,Lay Leader,,,,,2026-01-01,,', ''].join('\n'));
    const rows = rowsOf();
    expect(rows[0]).toMatchObject({ status: 'REVIEW', reason: 'AMBIGUOUS_PERSON' });
    expect(JSON.parse(rows[0].matches!).map((m: { memberId: string }) => m.memberId)).toEqual(['a', 'b']);
    expect(rows[0].matches).not.toContain('0771111111'); // candidates do not leak full phone numbers
    expect(rows[1].status).toBe('VALID');
    expect(JSON.parse(rows[1].parsed!).memberId).toBe('b');

    prisma.memberImportRow.createMany.mockClear();
    await put([`${HEADER},member_number`, 'Someone,Else,,Lay Leader,,,,,2026-01-01,,,M-a', ''].join('\n'));
    expect(e(rowsOf()[0])).toContain('belongs to Ruth Moyo');
  });

  test('re-importing an existing appointment is skipped, not duplicated', async () => {
    prisma.appointment.findMany.mockResolvedValue([{ memberId: 'a', positionId: 'pos-LAY_LEADER', scopeType: 'CHURCH', scopeId: 'church-1', termStart: new Date('2026-01-01T00:00:00Z'), termEnd: null }]);
    await put([HEADER, 'Ruth,Moyo,,Lay Leader,,,,,2026-01-01,,', 'Ruth,Moyo,,Lay Leader,,,,,2026-01-01,,', ''].join('\n'));
    expect(rowsOf().map((r) => r.status)).toEqual(['SKIPPED', 'SKIPPED']);
  });

  test('single-holder positions reject an overlapping second holder', async () => {
    prisma.positionDefinition.findMany.mockResolvedValue(CATALOGUE.map((c) => pos(c.name, c.name === 'Lay Leader' ? { allowMultiple: false } : {})));
    prisma.appointment.findMany.mockResolvedValue([{ memberId: 'zzz', positionId: 'pos-LAY_LEADER', scopeType: 'CHURCH', scopeId: 'church-1', termStart: new Date('2025-01-01'), termEnd: null }]);
    await put([HEADER, 'Ruth,Moyo,,Lay Leader,,,,,2026-01-01,,', ''].join('\n'));
    expect(e(rowsOf()[0])).toContain('allows one holder');
  });
});

describe('leadership decisions and confirm', () => {
  const job = (over: Record<string, unknown> = {}) => ({ id: 'job1', kind: 'LEADERSHIP', churchId: 'church-1', fileName: 'l.csv', status: 'PREVIEWED', totalRows: 1, templateVersion: '1.0', createdAt: new Date(), finishedAt: null, startedAt: null, createdBy: 'u1', ...over });
  const plan = (over: Record<string, unknown> = {}) => JSON.stringify({ memberId: 'a', positionId: 'pos-LAY_LEADER', positionCode: 'LAY_LEADER', positionName: 'Lay Leader', scopeType: 'CHURCH', scopeId: 'church-1', sectionId: null, committeeId: null, department: null, termStart: '2026-01-01', termEnd: '2026-12-31', finalStatus: 'ACTIVE', grantsAfterApproval: [], ...over });
  const confirm = () => request(app).post(`${base}/import/job1/confirm`).set(as('u1', 'leadership:import')).send({});

  test('an ambiguous row must be resolved to one of the listed candidates', async () => {
    prisma.memberImportJob.findUnique.mockResolvedValue(job());
    prisma.memberImportRow.findMany.mockResolvedValue([{ id: 'r1', rowNumber: 2, matches: JSON.stringify([{ memberId: 'a' }, { memberId: 'b' }]) }]);
    prisma.memberImportRow.updateMany.mockResolvedValue({ count: 1 });
    const decide = (decision: string) => request(app).put(`${base}/import/job1/decisions`).set(as('u1', 'leadership:import')).send({ decisions: [{ row: 2, decision }] });
    expect((await decide('USE:stranger')).status).toBe(400);
    expect((await decide('CREATE')).status).toBe(400);
    expect((await decide('USE:b')).status).toBe(200);
    expect(prisma.memberImportRow.updateMany.mock.calls[0][0].data).toEqual({ decision: 'USE:b' });
  });

  test("a member-import job cannot be driven through the leadership endpoints (and vice versa)", async () => {
    prisma.memberImportJob.findUnique.mockResolvedValue(job({ kind: 'MEMBERS' }));
    expect((await request(app).get(`${base}/import/job1`).set(as('u1', 'leadership:import'))).status).toBe(404);
  });

  const runConfirm = (rows: unknown[], tx: () => void = () => undefined) => {
    prisma.memberImportJob.findUnique.mockResolvedValueOnce(job()).mockResolvedValue(job({ status: 'PROCESSING' }));
    prisma.memberImportRow.findMany.mockResolvedValueOnce(rows).mockResolvedValue([]);
    prisma.memberImportRow.count.mockResolvedValue(0);
    prisma.memberImportJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.memberImportJob.update.mockResolvedValue({});
    prisma.memberImportRow.updateMany.mockResolvedValue({ count: 0 });
    prisma.member.findUnique.mockResolvedValue({ churchId: 'church-1', membershipStatus: 'ACTIVE', archivedAt: null });
    prisma.positionDefinition.findUnique.mockResolvedValue(pos('Lay Leader'));
    prisma.memberImportRow.update.mockResolvedValue({});
    tx();
    return confirm();
  };

  test('creates the appointment, links it from the row, and never creates people or grants directly', async () => {
    prisma.appointment.create.mockResolvedValue({ id: 'appt1' });
    prisma.memberImportRow.groupBy.mockResolvedValue([{ status: 'IMPORTED', decision: null, _count: { _all: 1 } }]);
    const res = await runConfirm([{ id: 'r1', rowNumber: 2, status: 'VALID', decision: null, parsed: plan() }]);
    expect(res.body).toMatchObject({ status: 'COMPLETED', reconciles: true });
    expect(prisma.appointment.create.mock.calls[0][0].data).toMatchObject({ churchId: 'church-1', memberId: 'a', status: 'ACTIVE', termEnd: new Date('2027-01-01T00:00:00.000Z'), importJobId: 'job1' });
    expect(prisma.memberImportRow.update.mock.calls[0][0].data).toEqual({ status: 'IMPORTED', memberId: 'a', reason: 'appt1' });
    expect(prisma.member.create).not.toHaveBeenCalled();
    expect(prisma.scopedRoleAssignment.create).not.toHaveBeenCalled();
  });

  test('if the position gained system access after the preview, the appointment still lands PENDING', async () => {
    prisma.appointment.create.mockResolvedValue({ id: 'appt1' });
    prisma.memberImportRow.groupBy.mockResolvedValue([{ status: 'IMPORTED', decision: null, _count: { _all: 1 } }]);
    await runConfirm([{ id: 'r1', rowNumber: 2, status: 'VALID', decision: null, parsed: plan() }], () => prisma.positionDefinition.findUnique.mockResolvedValue(pos('Lay Leader', { mappedRoleId: 'role-x' })));
    expect(prisma.appointment.create.mock.calls[0][0].data.status).toBe('PENDING');
  });

  test('a repeat of an existing appointment (unique key) is skipped, not failed or duplicated', async () => {
    prisma.appointment.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 't' }));
    prisma.memberImportRow.groupBy.mockResolvedValue([{ status: 'SKIPPED', decision: null, _count: { _all: 1 } }]);
    const res = await runConfirm([{ id: 'r1', rowNumber: 2, status: 'VALID', decision: null, parsed: plan() }]);
    expect(prisma.memberImportRow.update.mock.calls.at(-1)![0].data.status).toBe('SKIPPED');
    expect(res.body.status).toBe('COMPLETED');
  });

  test('a member who left since the preview fails the row (kept for correction), and the job is not reported complete', async () => {
    prisma.memberImportRow.groupBy.mockResolvedValue([{ status: 'FAILED', decision: null, _count: { _all: 1 } }]);
    const res = await runConfirm([{ id: 'r1', rowNumber: 2, status: 'VALID', decision: null, parsed: plan() }], () => prisma.member.findUnique.mockResolvedValue({ churchId: 'church-1', membershipStatus: 'INACTIVE', archivedAt: null }));
    expect(prisma.appointment.create).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({ status: 'PARTIAL', remaining: 1 });
  });
});
