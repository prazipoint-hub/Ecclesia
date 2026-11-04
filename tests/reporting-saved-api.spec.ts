import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { createMockPrisma } from './helpers/mockPrisma';

const mocked = vi.hoisted(() => ({ prisma: undefined as unknown, send: undefined as unknown }));

vi.mock('@/database', async () => {
  const { createMockPrisma: create } = await import('./helpers/mockPrisma');
  mocked.prisma = create();
  return { prisma: mocked.prisma, default: mocked.prisma };
});
vi.mock('@/services/email', () => {
  const send = vi.fn().mockResolvedValue(undefined);
  mocked.send = send;
  return { emailService: { send } };
});

import { createApp } from '@/app';
import { jwtSecret } from '@/config/secrets';
import { nextRunAfter, savedReportService } from '@/features/reporting/service/saved';
import { reportRunner, resolveDates } from '@/features/reporting/service/runner';

const prisma = mocked.prisma as ReturnType<typeof createMockPrisma>;
const send = mocked.send as ReturnType<typeof vi.fn>;
const app = createApp();
const base = '/api/v2/reports';

const token = (id: string, memberId: string | null, permissions: string[]) => ({
  Authorization: `Bearer ${jwt.sign({ sub: id, email: `${id}@example.com`, churchId: 'church-1', memberId, permissions, sessionId: 's1', tokenId: 't1' }, jwtSecret, { expiresIn: '5m' })}`,
});
const as = (...permissions: string[]) => token('user-1', 'member-1', permissions);
const asOther = (...permissions: string[]) => token('user-2', 'member-2', permissions);

const FILE = { reportType: 'MEMBERSHIP_SUMMARY', format: 'CSV', generatedAt: new Date(), filename: 'membership_summary.csv', mimeType: 'text/csv', data: [{ a: 1 }, { a: 2 }], content: 'a\n1\n2' };
const saved = (over: Record<string, unknown> = {}) => ({
  id: 's1', churchId: 'church-1', createdBy: 'user-1', name: 'Monthly members', description: null, reportType: 'MEMBERSHIP_SUMMARY', parameters: {}, format: 'CSV',
  visibility: 'PRIVATE', schedule: 'NONE', recipients: [], nextRunAt: null, lastRunAt: null, isActive: true, failureCount: 0, ...over,
});
/** A user row as the repository reads it, with permissions granted through a leadership role. */
const userRow = (id: string, email: string, ...perms: string[]) => ({
  id, email, churchId: 'church-1', memberId: `m-${id}`,
  member: { leadershipAssignments: [{ id: 'a', sectionId: null, role: { id: 'r', name: 'Role', permissions: perms.map((name) => ({ permission: { name } })) } }] },
});

beforeEach(() => {
  vi.resetAllMocks();
  send.mockResolvedValue(undefined);
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.auditLog.create.mockResolvedValue({});
  prisma.reportExecution.create.mockResolvedValue({ id: 'x1' });
  prisma.reportExecution.update.mockResolvedValue({});
});
afterEach(() => vi.restoreAllMocks());

describe('rolling periods', () => {
  const now = new Date('2026-03-15T10:00:00Z');
  test('last month is the whole previous calendar month', () => {
    const { start, end } = resolveDates({ period: 'LAST_MONTH' }, now);
    expect(start!.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(end!.toISOString()).toBe('2026-02-28T23:59:59.999Z');
  });
  test('last month in January is December of the year before', () => {
    const { start, end } = resolveDates({ period: 'LAST_MONTH' }, new Date('2026-01-10T00:00:00Z'));
    expect(start!.toISOString()).toBe('2025-12-01T00:00:00.000Z');
    expect(end!.toISOString()).toBe('2025-12-31T23:59:59.999Z');
  });
  test('this year and last year', () => {
    expect(resolveDates({ period: 'THIS_YEAR' }, now).start!.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    const ly = resolveDates({ period: 'LAST_YEAR' }, now);
    expect([ly.start!.toISOString(), ly.end!.toISOString()]).toEqual(['2025-01-01T00:00:00.000Z', '2025-12-31T23:59:59.999Z']);
  });
  test('a fixed end date includes the whole day', () => {
    const { end } = resolveDates({ startDate: new Date('2026-01-01'), endDate: new Date('2026-01-31') }, now);
    expect(end!.toISOString()).toBe('2026-01-31T23:59:59.999Z');
  });
});

describe('schedule slots', () => {
  test('daily, weekly and monthly land on 06:00 UTC', () => {
    const from = new Date('2026-03-18T12:00:00Z'); // a Wednesday
    expect(nextRunAfter('DAILY', from)!.toISOString()).toBe('2026-03-19T06:00:00.000Z');
    expect(nextRunAfter('WEEKLY', from)!.toISOString()).toBe('2026-03-23T06:00:00.000Z'); // next Monday
    expect(nextRunAfter('MONTHLY', from)!.toISOString()).toBe('2026-04-01T06:00:00.000Z');
    expect(nextRunAfter('NONE', from)).toBeNull();
  });
  test('weekly on a Monday waits a full week', () => {
    expect(nextRunAfter('WEEKLY', new Date('2026-03-16T07:00:00Z'))!.toISOString()).toBe('2026-03-23T06:00:00.000Z');
  });
});

describe('catalog and ad-hoc runs', () => {
  test('the catalog marks what the viewer may run', async () => {
    const res = await request(app).get(`${base}/catalog`).set(as('report:view:administrative'));
    const byType = Object.fromEntries(res.body.map((r: { type: string; allowed: boolean }) => [r.type, r.allowed]));
    expect(byType.MEMBERSHIP_SUMMARY).toBe(true);
    expect(byType.INCOME_STATEMENT).toBe(false);
    expect(res.body.every((r: { type: string }) => !['BALANCE_SHEET', 'CASH_FLOW'].includes(r.type))).toBe(true);
  });

  test('running needs the permission for that report type', async () => {
    const res = await request(app).post(`${base}/run`).set(as()).send({ reportType: 'MEMBERSHIP_SUMMARY' });
    expect(res.status).toBe(403);
    expect(prisma.reportExecution.update.mock.calls[0][0].data.status).toBe('FAILED');
  });

  test('a successful run downloads the file and records the execution', async () => {
    vi.spyOn(reportRunner, 'run').mockResolvedValue({ report: FILE as never, rowCount: 2 });
    const res = await request(app).post(`${base}/run`).set(as('report:view:administrative')).send({ reportType: 'MEMBERSHIP_SUMMARY', format: 'CSV' });
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('membership_summary.csv');
    expect(res.headers['x-execution-id']).toBe('x1');
    expect(prisma.reportExecution.create.mock.calls[0][0].data).toMatchObject({ churchId: 'church-1', requestedBy: 'user-1', trigger: 'ADHOC' });
    expect(prisma.reportExecution.update.mock.calls[0][0].data).toMatchObject({ status: 'SUCCEEDED', rowCount: 2, filename: 'membership_summary.csv' });
  });

  test('JSON comes back inline', async () => {
    vi.spyOn(reportRunner, 'run').mockResolvedValue({ report: { ...FILE, format: 'JSON', filename: 'x.json', content: '[{"a":1}]' } as never, rowCount: 1 });
    const res = await request(app).post(`${base}/run`).set(as('report:view:administrative')).send({ reportType: 'MEMBERSHIP_SUMMARY', format: 'JSON' });
    expect(res.body.data).toEqual([{ a: 1 }]);
  });

  test('a report that needs dates refuses to run without them, and a failed run is recorded', async () => {
    const res = await request(app).post(`${base}/run`).set(as('report:view:financial')).send({ reportType: 'RECEIPT_DETAIL' });
    expect(res.status).toBe(400);
    expect(prisma.reportExecution.update.mock.calls[0][0].data).toMatchObject({ status: 'FAILED' });
  });

  test('an unknown report type, a reversed range and a huge range are refused', async () => {
    expect((await request(app).post(`${base}/run`).set(as('report:view:financial')).send({ reportType: 'CASH_FLOW' })).status).toBe(400);
    const reversed = await request(app).post(`${base}/run`).set(as('report:view:financial')).send({ reportType: 'RECEIPT_DETAIL', parameters: { startDate: '2026-02-01', endDate: '2026-01-01' } });
    expect(reversed.status).toBe(400);
    const huge = await request(app).post(`${base}/run`).set(as('report:view:financial')).send({ reportType: 'RECEIPT_DETAIL', parameters: { startDate: '2020-01-01', endDate: '2026-01-01' } });
    expect(huge.status).toBe(400);
  });

  test('parameters outside the allowed set are refused', async () => {
    const res = await request(app).post(`${base}/run`).set(as('report:view:administrative')).send({ reportType: 'MEMBERSHIP_SUMMARY', parameters: { churchId: 'church-2' } });
    expect(res.status).toBe(400);
  });
});

describe('saved reports', () => {
  const create = (over: Record<string, unknown> = {}) => ({ name: 'Monthly members', reportType: 'MEMBERSHIP_SUMMARY', ...over });
  const perm = 'report:view:administrative';

  test('creating needs the permission for the report type', async () => {
    expect((await request(app).post(`${base}/saved`).set(as()).send(create())).status).toBe(403);
    expect(prisma.savedReport.create).not.toHaveBeenCalled();
  });

  test('an unscheduled report is saved under the signed-in owner', async () => {
    prisma.savedReport.create.mockResolvedValue(saved());
    expect((await request(app).post(`${base}/saved`).set(as(perm)).send(create())).status).toBe(201);
    expect(prisma.savedReport.create.mock.calls[0][0].data).toMatchObject({ churchId: 'church-1', createdBy: 'user-1', schedule: 'NONE', nextRunAt: null });
  });

  test('a schedule needs recipients and cannot be JSON', async () => {
    expect((await request(app).post(`${base}/saved`).set(as(perm)).send(create({ schedule: 'WEEKLY' }))).status).toBe(400);
    expect((await request(app).post(`${base}/saved`).set(as(perm)).send(create({ schedule: 'WEEKLY', recipients: ['a@example.com'], format: 'JSON' }))).status).toBe(400);
  });

  test('recipients must be users of this church who may see the report', async () => {
    prisma.user.findMany.mockResolvedValue([userRow('u9', 'known@example.com')]);
    const unknown = await request(app).post(`${base}/saved`).set(as(perm)).send(create({ schedule: 'DAILY', recipients: ['known@example.com', 'stranger@example.com'] }));
    expect(unknown.status).toBe(400);
    expect(unknown.body.error).toContain('stranger@example.com');
    const denied = await request(app).post(`${base}/saved`).set(as(perm)).send(create({ schedule: 'DAILY', recipients: ['known@example.com'] }));
    expect(denied.status).toBe(400);
    expect(denied.body.error).toContain('not allowed');
    expect(prisma.savedReport.create).not.toHaveBeenCalled();
    expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({ churchId: 'church-1' });
  });

  test('a valid schedule stores the next run time', async () => {
    prisma.user.findMany.mockResolvedValue([userRow('u9', 'ok@example.com', perm)]);
    prisma.savedReport.create.mockResolvedValue(saved({ schedule: 'DAILY' }));
    expect((await request(app).post(`${base}/saved`).set(as(perm)).send(create({ schedule: 'DAILY', recipients: ['OK@example.com'] }))).status).toBe(201);
    const data = prisma.savedReport.create.mock.calls[0][0].data;
    expect(data.nextRunAt).toBeInstanceOf(Date);
    expect(data.recipients).toEqual(['ok@example.com']);
  });

  test('someone else\'s private report does not exist for you', async () => {
    prisma.savedReport.findFirst.mockResolvedValue(saved());
    expect((await request(app).get(`${base}/saved/s1`).set(asOther(perm))).status).toBe(404);
    expect((await request(app).post(`${base}/saved/s1/run`).set(asOther(perm))).status).toBe(404);
  });

  test('a shared report is visible only to people who could run it, and only its owner can change it', async () => {
    prisma.savedReport.findFirst.mockResolvedValue(saved({ visibility: 'CHURCH' }));
    expect((await request(app).get(`${base}/saved/s1`).set(asOther())).status).toBe(404);
    expect((await request(app).get(`${base}/saved/s1`).set(asOther(perm))).status).toBe(200);
    expect((await request(app).put(`${base}/saved/s1`).set(asOther(perm)).send({ name: 'Hijack' })).status).toBe(403);
    expect((await request(app).delete(`${base}/saved/s1`).set(asOther(perm))).status).toBe(403);
    expect(prisma.savedReport.update).not.toHaveBeenCalled();
    expect(prisma.savedReport.delete).not.toHaveBeenCalled();
  });

  test('a report manager can change anyone\'s report', async () => {
    prisma.savedReport.findFirst.mockResolvedValue(saved());
    prisma.savedReport.update.mockResolvedValue(saved({ name: 'Renamed' }));
    expect((await request(app).put(`${base}/saved/s1`).set(asOther(perm, 'report:saved:manage_all')).send({ name: 'Renamed' })).status).toBe(200);
  });

  test('the owner can delete', async () => {
    prisma.savedReport.findFirst.mockResolvedValue(saved());
    prisma.savedReport.delete.mockResolvedValue(saved());
    expect((await request(app).delete(`${base}/saved/s1`).set(as(perm))).status).toBe(200);
  });

  test('turning a schedule on sets the next run, and reactivating clears the failure count', async () => {
    prisma.savedReport.findFirst.mockResolvedValue(saved({ isActive: false, failureCount: 5 }));
    prisma.user.findMany.mockResolvedValue([userRow('u9', 'ok@example.com', perm)]);
    prisma.savedReport.update.mockResolvedValue(saved());
    await request(app).put(`${base}/saved/s1`).set(as(perm)).send({ schedule: 'WEEKLY', recipients: ['ok@example.com'], isActive: true });
    const data = prisma.savedReport.update.mock.calls[0][0].data;
    expect(data.nextRunAt).toBeInstanceOf(Date);
    expect(data.failureCount).toBe(0);
  });

  test('the list hides shared reports the viewer could not run', async () => {
    prisma.savedReport.findMany.mockResolvedValue([saved({ id: 'a', createdBy: 'user-2', visibility: 'CHURCH', reportType: 'AUDIT_TRAIL' }), saved({ id: 'b', createdBy: 'user-2', visibility: 'CHURCH' })]);
    const res = await request(app).get(`${base}/saved`).set(as(perm));
    expect(res.body.map((r: { id: string }) => r.id)).toEqual(['b']);
  });

  test('running a saved report records a manual execution against it', async () => {
    prisma.savedReport.findFirst.mockResolvedValue(saved());
    vi.spyOn(reportRunner, 'run').mockResolvedValue({ report: FILE as never, rowCount: 2 });
    expect((await request(app).post(`${base}/saved/s1/run`).set(as(perm))).status).toBe(200);
    expect(prisma.reportExecution.create.mock.calls[0][0].data).toMatchObject({ reportId: 's1', trigger: 'MANUAL' });
  });

  test('execution history shows your own runs unless you manage all reports', async () => {
    prisma.reportExecution.findMany.mockResolvedValue([]);
    prisma.reportExecution.count.mockResolvedValue(0);
    await request(app).get(`${base}/executions`).set(as());
    expect(prisma.reportExecution.findMany.mock.calls[0][0].where).toMatchObject({ churchId: 'church-1', requestedBy: 'user-1' });
    await request(app).get(`${base}/executions`).set(as('report:saved:manage_all'));
    expect(prisma.reportExecution.findMany.mock.calls[1][0].where).toEqual({ churchId: 'church-1' });
  });
});

describe('scheduled runs', () => {
  const perm = 'report:view:administrative';
  const due = (over: Record<string, unknown> = {}) => saved({ schedule: 'DAILY', recipients: ['ok@example.com', 'nope@example.com'], nextRunAt: new Date('2026-03-01T06:00:00Z'), ...over });

  test('only people with the run-due permission can trigger the sweep', async () => {
    expect((await request(app).post(`${base}/saved/run-due`).set(as())).status).toBe(403);
  });

  test('a run is claimed first; losing the claim means another worker has it', async () => {
    prisma.savedReport.findMany.mockResolvedValue([due()]);
    prisma.savedReport.updateMany.mockResolvedValue({ count: 0 });
    const spy = vi.spyOn(reportRunner, 'run');
    expect(await savedReportService.runDue(new Date('2026-03-02T00:00:00Z'))).toEqual({ ran: 0, failed: 0 });
    expect(spy).not.toHaveBeenCalled();
    expect(prisma.savedReport.updateMany.mock.calls[0][0].where).toMatchObject({ id: 's1', isActive: true, nextRunAt: new Date('2026-03-01T06:00:00Z') });
  });

  test('the report is built with the owner\'s current permissions and mailed only to recipients who may see it', async () => {
    prisma.savedReport.findMany.mockResolvedValue([due()]);
    prisma.savedReport.updateMany.mockResolvedValue({ count: 1 });
    prisma.savedReport.update.mockResolvedValue({ failureCount: 0 });
    prisma.user.findMany.mockImplementation((async ({ where }: { where: { id?: string; email?: { in: string[] } } }) =>
      where.id ? [userRow('user-1', 'owner@example.com', perm)] : [userRow('u2', 'ok@example.com', perm), userRow('u3', 'nope@example.com', 'member:view')]) as never);
    const spy = vi.spyOn(reportRunner, 'run').mockResolvedValue({ report: FILE as never, rowCount: 2 });

    expect(await savedReportService.runDue(new Date('2026-03-02T00:00:00Z'))).toEqual({ ran: 1, failed: 0 });
    expect(spy.mock.calls[0][0].permissions).toEqual([perm]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ to: 'ok@example.com', attachments: [{ filename: 'membership_summary.csv' }] });
    expect(prisma.reportExecution.create.mock.calls[0][0].data.trigger).toBe('SCHEDULED');
    // next slot is booked in the claim itself
    expect(prisma.savedReport.updateMany.mock.calls[0][0].data.nextRunAt).toEqual(new Date('2026-03-03T06:00:00.000Z'));
  });

  test('an owner who lost the permission gets a failed run and no email', async () => {
    prisma.savedReport.findMany.mockResolvedValue([due()]);
    prisma.savedReport.updateMany.mockResolvedValue({ count: 1 });
    prisma.savedReport.update.mockResolvedValue({ failureCount: 1 });
    prisma.user.findMany.mockResolvedValue([userRow('user-1', 'owner@example.com', 'member:view')]);
    expect(await savedReportService.runDue()).toEqual({ ran: 0, failed: 1 });
    expect(send).not.toHaveBeenCalled();
    expect(prisma.reportExecution.update.mock.calls[0][0].data.status).toBe('FAILED');
  });

  test('a deleted owner fails the run', async () => {
    prisma.savedReport.findMany.mockResolvedValue([due()]);
    prisma.savedReport.updateMany.mockResolvedValue({ count: 1 });
    prisma.savedReport.update.mockResolvedValue({ failureCount: 1 });
    prisma.user.findMany.mockResolvedValue([]);
    expect(await savedReportService.runDue()).toEqual({ ran: 0, failed: 1 });
  });

  test('after five failures in a row the schedule switches itself off', async () => {
    prisma.savedReport.findMany.mockResolvedValue([due()]);
    prisma.savedReport.updateMany.mockResolvedValue({ count: 1 });
    prisma.savedReport.update.mockResolvedValueOnce({ failureCount: 5 }).mockResolvedValue({});
    prisma.user.findMany.mockResolvedValue([]);
    await savedReportService.runDue();
    expect(prisma.savedReport.update.mock.calls[1][0]).toMatchObject({ where: { id: 's1' }, data: { isActive: false, nextRunAt: null } });
  });

  test('success resets the failure count', async () => {
    prisma.savedReport.findMany.mockResolvedValue([due({ recipients: [] })]);
    prisma.savedReport.updateMany.mockResolvedValue({ count: 1 });
    prisma.savedReport.update.mockResolvedValue({ failureCount: 0 });
    prisma.user.findMany.mockResolvedValue([userRow('user-1', 'o@example.com', perm)]);
    vi.spyOn(reportRunner, 'run').mockResolvedValue({ report: FILE as never, rowCount: 1 });
    await savedReportService.runDue();
    expect(prisma.savedReport.update.mock.calls[0][0].data).toEqual({ failureCount: 0 });
  });
});

describe('dashboards', () => {
  test('a viewer with no permissions gets empty blocks, not data', async () => {
    const res = await request(app).get(`${base}/dashboards/church`).set(as());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ members: null, attendance: null, finance: null, pastoral: null, upcomingEvents: null });
    expect(prisma.member.groupBy).not.toHaveBeenCalled();
    expect(prisma.receipt.findMany).not.toHaveBeenCalled();
  });

  test('finance and pastoral blocks need their own permissions', async () => {
    prisma.receipt.findMany.mockResolvedValue([{ amount: '100.50', currency: 'USD', incomeType: 'TITHE', issuedAt: new Date() }, { amount: '20', currency: 'USD', incomeType: 'OFFERING', issuedAt: new Date() }]);
    prisma.expenditure.findMany.mockResolvedValue([{ amount: '30', approvedAt: new Date() }]);
    prisma.expenditure.count.mockResolvedValue(2);
    const res = await request(app).get(`${base}/dashboards/church`).set(as('finance:view'));
    expect(res.body.finance).toMatchObject({ incomeThisMonth: { USD: 120.5 }, spendingThisMonth: 30, awaitingApproval: 2 });
    expect(res.body.finance.months).toHaveLength(6);
    expect(res.body.pastoral).toBeNull();
    expect(res.body.members).toBeNull();
    expect(prisma.receipt.findMany.mock.calls[0][0].where).toMatchObject({ churchId: 'church-1', status: 'ISSUED' });
  });

  test('member counts and eight weeks of attendance', async () => {
    prisma.member.groupBy.mockResolvedValueOnce([{ membershipStatus: 'ACTIVE', _count: { _all: 90 } }, { membershipStatus: 'INACTIVE', _count: { _all: 10 } }]).mockResolvedValueOnce([{ gender: 'FEMALE', _count: { _all: 50 } }, { gender: null, _count: { _all: 40 } }]);
    prisma.member.count.mockResolvedValue(4);
    prisma.event.findMany.mockResolvedValue([]);
    const res = await request(app).get(`${base}/dashboards/church`).set(as('member:view', 'event:view'));
    expect(res.body.members).toMatchObject({ total: 100, active: 90, joinedThisMonth: 4, activeByGender: { FEMALE: 50, UNSPECIFIED: 40 } });
    expect(res.body.attendance.weeks).toHaveLength(8);
    expect(prisma.member.groupBy.mock.calls[0][0].where).toMatchObject({ churchId: 'church-1', archivedAt: null });
  });

  test('a section from another church is not found', async () => {
    prisma.section.findFirst.mockResolvedValue(null);
    expect((await request(app).get(`${base}/dashboards/section/other`).set(as('member:view'))).status).toBe(404);
    expect(prisma.section.findFirst.mock.calls[0][0].where).toEqual({ id: 'other', churchId: 'church-1' });
  });

  test('section finance needs the section finance permission', async () => {
    prisma.section.findFirst.mockResolvedValue({ id: 'sec1', name: 'North' });
    const res = await request(app).get(`${base}/dashboards/section/sec1`).set(as());
    expect(res.body.finance).toBeNull();
    expect(prisma.sectionReceipt.findMany).not.toHaveBeenCalled();
  });

  test('hierarchy roll-ups need the all-churches permission and stay in the viewer\'s own chain', async () => {
    expect((await request(app).get(`${base}/dashboards/hierarchy/circuit`).set(as())).status).toBe(403);
    prisma.church.findUnique.mockResolvedValue({ id: 'church-1', circuitId: 'c1', circuit: { id: 'c1', name: 'Circuit One', districtId: 'd1', district: { id: 'd1', name: 'District One', conferenceId: 'k1', conference: { id: 'k1', name: 'Conf' } } } });
    prisma.church.findMany.mockResolvedValue([{ id: 'church-1', name: 'A', circuit: { name: 'Circuit One' } }, { id: 'church-9', name: 'B', circuit: { name: 'Circuit One' } }]);
    prisma.member.groupBy.mockResolvedValue([{ churchId: 'church-1', _count: { _all: 40 } }]);
    prisma.event.findMany.mockResolvedValue([{ churchId: 'church-1', _count: { attendances: 30 } }, { churchId: 'church-1', _count: { attendances: 20 } }]);
    const res = await request(app).get(`${base}/dashboards/hierarchy/circuit`).set(as('report:view:all_churches'));
    expect(res.status).toBe(200);
    expect(prisma.church.findMany.mock.calls[0][0].where).toEqual({ circuitId: 'c1' });
    expect(res.body.totals).toEqual({ churches: 2, activeMembers: 40, attendanceLast30Days: 50 });
    expect(res.body.churches[1]).toMatchObject({ churchId: 'church-9', activeMembers: 0 });
    const district = await request(app).get(`${base}/dashboards/hierarchy/district`).set(as('report:view:all_churches'));
    expect(district.status).toBe(200);
    expect(prisma.church.findMany.mock.calls[1][0].where).toEqual({ circuit: { districtId: 'd1' } });
    expect((await request(app).get(`${base}/dashboards/hierarchy/galaxy`).set(as('report:view:all_churches'))).status).toBe(400);
  });

  test('a church with no circuit has no circuit roll-up', async () => {
    prisma.church.findUnique.mockResolvedValue({ id: 'church-1', circuitId: null, circuit: null });
    expect((await request(app).get(`${base}/dashboards/hierarchy/circuit`).set(as('report:view:all_churches'))).status).toBe(404);
  });
});
