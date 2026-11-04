import jwt from 'jsonwebtoken';
import request from 'supertest';
import { unzipSync } from 'fflate';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { createMockPrisma } from './helpers/mockPrisma';
import type { withLegacyModels } from './helpers/legacyMocks';

const mocked = vi.hoisted(() => ({ prisma: undefined as unknown }));

vi.mock('@/database', async () => {
  const { createMockPrisma: create } = await import('./helpers/mockPrisma');
  const { withLegacyModels: extend } = await import('./helpers/legacyMocks');
  mocked.prisma = extend(create());
  return { prisma: mocked.prisma, default: mocked.prisma };
});

import { createApp } from '@/app';
import { jwtSecret } from '@/config/secrets';
import { reportingService } from '@/features/reporting/service';
import { financialReportRepository } from '@/features/reporting/repository/financial';

const prisma = mocked.prisma as ReturnType<typeof withLegacyModels<ReturnType<typeof createMockPrisma>>>;
const app = createApp();
const base = '/api/v2/reports';

const as = (...permissions: string[]) => ({
  Authorization: `Bearer ${jwt.sign({ sub: 'user-1', email: 'u1@example.com', churchId: 'church-1', memberId: 'member-1', permissions, sessionId: 's1', tokenId: 't1' }, jwtSecret, { expiresIn: '5m' })}`,
});
const binary = (r: any, cb: (e: Error | null, b: Buffer) => void) => { const c: Buffer[] = []; r.on('data', (d: Buffer) => c.push(d)); r.on('end', () => cb(null, Buffer.concat(c))); };

const dates = { startDate: '2026-01-01T00:00:00.000Z', endDate: '2026-01-31T23:59:59.000Z' };
const fin = (over: object = {}) => ({ churchId: 'church-1', reportType: 'INCOME_STATEMENT', ...dates, format: 'JSON', ...over });
const adm = (over: object = {}) => ({ churchId: 'church-1', reportType: 'MEMBERSHIP_SUMMARY', format: 'JSON', ...over });
const aud = (over: object = {}) => ({ churchId: 'church-1', reportType: 'AUDIT_TRAIL', ...dates, format: 'JSON', ...over });
const postFin = (body: object, ...perms: string[]) => request(app).post(`${base}/financial`).set(as(...(perms.length ? perms : ['report:view:financial']))).send(body);
const postAdm = (body: object, ...perms: string[]) => request(app).post(`${base}/administrative`).set(as(...(perms.length ? perms : ['report:view:administrative']))).send(body);
const postAud = (body: object, ...perms: string[]) => request(app).post(`${base}/audit`).set(as(...(perms.length ? perms : ['report:view:audit']))).send(body);

beforeEach(() => {
  vi.resetAllMocks();
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.auditLog.create.mockResolvedValue({});
  prisma.receipt.aggregate.mockResolvedValue({ _sum: { amount: 300 } });
  prisma.expenditure.aggregate.mockResolvedValue({ _sum: { amount: 100 } });
});

describe('permissions', () => {
  test.each([['/financial', 'report:view:financial'], ['/administrative', 'report:view:administrative'], ['/audit', 'report:view:audit']])('%s needs %s', async (path, perm) => {
    expect((await request(app).post(base + path)).status).toBe(401);
    expect((await request(app).post(base + path).set(as('report:view:all_churches'))).status).toBe(403);
    expect(perm).toMatch(/^report:view:/);
  });
});

describe('financial reports', () => {
  test('main church income statement excludes organisation money and counts only paid expenditure', async () => {
    const res = await postFin(fin());
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ totalIncome: 300, totalExpense: 100, netIncome: 200, scope: 'Main Church' });
    const receiptWhere = prisma.receipt.aggregate.mock.calls[0][0].where;
    expect(receiptWhere).toMatchObject({ churchId: 'church-1', organizationId: null });
    expect(receiptWhere.issuedAt.gte.toISOString()).toBe(dates.startDate);
    expect(prisma.expenditure.aggregate.mock.calls[0][0].where).toMatchObject({ churchId: 'church-1', organizationId: null, status: 'PAID' });
  });

  test('organisation scope needs the organisation in this church and the finance permission', async () => {
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', churchId: 'church-1' });
    expect([401, 403]).toContain((await postFin(fin({ organizationId: 'org-1', scope: 'ORGANIZATION' }))).status);
    const ok = await postFin(fin({ organizationId: 'org-1', scope: 'ORGANIZATION' }), 'report:view:financial', 'report:view:organization_finance');
    expect(ok.status).toBe(200);
    expect(prisma.receipt.aggregate.mock.calls[0][0].where.organizationId).toBe('org-1');
    expect(ok.body.data.scope).toBe('Organization: org-1');
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', churchId: 'church-2' });
    expect((await postFin(fin({ organizationId: 'org-1' }), 'report:view:financial', 'report:view:organization_finance')).status).toBe(404);
    prisma.organization.findUnique.mockResolvedValue(null);
    expect((await postFin(fin({ organizationId: 'org-1' }), 'report:view:financial', 'report:view:organization_finance')).status).toBe(404);
  });

  test('section scope reads section ledgers and needs its own permission', async () => {
    prisma.section.findUnique.mockResolvedValue({ id: 'sec-1', churchId: 'church-1' });
    prisma.sectionReceipt.aggregate.mockResolvedValue({ _sum: { amount: 50 } });
    prisma.sectionExpenditure.aggregate.mockResolvedValue({ _sum: { amount: 20 } });
    expect([401, 403]).toContain((await postFin(fin({ sectionId: 'sec-1' }))).status);
    const ok = await postFin(fin({ sectionId: 'sec-1' }), 'report:view:financial', 'report:view:section_finance');
    expect(ok.body.data).toMatchObject({ totalIncome: 50, totalExpense: 20, netIncome: 30 });
    expect(prisma.receipt.aggregate).not.toHaveBeenCalled();
    expect(prisma.sectionExpenditure.aggregate.mock.calls[0][0].where).toMatchObject({ sectionId: 'sec-1', status: 'PAID' });
    prisma.section.findUnique.mockResolvedValue({ id: 'sec-1', churchId: 'church-2' });
    expect((await postFin(fin({ sectionId: 'sec-1' }), 'report:view:financial', 'report:view:section_finance')).status).toBe(404);
  });

  test('another church is refused without the cross-church permission', async () => {
    expect([401, 403]).toContain((await postFin(fin({ churchId: 'church-2' }))).status);
    expect(prisma.receipt.aggregate).not.toHaveBeenCalled();
    expect((await postFin(fin({ churchId: 'church-2' }), 'report:view:financial', 'report:view:all_churches')).status).toBe(200);
  });

  test('trial balance, receipt detail and expenditure detail query the right tables', async () => {
    prisma.receipt.findMany.mockResolvedValue([{ incomeType: 'TITHE', amount: 10 }]);
    prisma.expenditure.findMany.mockResolvedValue([{ category: 'RENT', amount: 4 }]);
    const tb = await postFin(fin({ reportType: 'TRIAL_BALANCE' }));
    expect(tb.body.data).toEqual([{ account: 'TITHE', debit: 10, credit: 0 }, { account: 'RENT', debit: 0, credit: 4 }]);
    expect(prisma.expenditure.findMany.mock.calls[0][0].where).toMatchObject({ churchId: 'church-1', status: 'PAID' });

    await postFin(fin({ reportType: 'RECEIPT_DETAIL' }));
    expect(prisma.receipt.findMany.mock.calls[1][0].where).toMatchObject({ churchId: 'church-1', organizationId: null });
    await postFin(fin({ reportType: 'EXPENDITURE_DETAIL' }));
    expect(prisma.expenditure.findMany.mock.calls[1][0].where).toMatchObject({ churchId: 'church-1', organizationId: null, status: 'PAID' });
  });

  test('section trial balance and details use section ledgers', async () => {
    prisma.section.findUnique.mockResolvedValue({ id: 'sec-1', churchId: 'church-1' });
    prisma.sectionJournalEntry.findMany.mockResolvedValue([{ description: 'Offering', debitAmount: 5, creditAmount: null }]);
    prisma.sectionReceipt.findMany.mockResolvedValue([]);
    prisma.sectionExpenditure.findMany.mockResolvedValue([]);
    const perms = ['report:view:financial', 'report:view:section_finance'];
    expect((await postFin(fin({ reportType: 'TRIAL_BALANCE', sectionId: 'sec-1' }), ...perms)).body.data).toEqual([{ account: 'Offering', debit: 5, credit: 0 }]);
    await postFin(fin({ reportType: 'RECEIPT_DETAIL', sectionId: 'sec-1' }), ...perms);
    await postFin(fin({ reportType: 'EXPENDITURE_DETAIL', sectionId: 'sec-1' }), ...perms);
    expect(prisma.sectionReceipt.findMany.mock.calls[0][0].where).toMatchObject({ sectionId: 'sec-1' });
    expect(prisma.sectionExpenditure.findMany.mock.calls[0][0].where).toMatchObject({ sectionId: 'sec-1', status: 'PAID' });
  });

  test('validation', async () => {
    expect((await postFin(fin({ reportType: 'BALANCE_SHEET' }))).status).toBe(400);
    expect((await postFin(fin({ startDate: '2026-01-01' }))).status).toBe(400);
    expect((await postFin(fin({ format: 'DOCX' }))).status).toBe(400);
    expect((await postFin(fin({ scope: 'GLOBAL' }))).status).toBe(400);
    expect((await postFin(fin({ churchId: '' }))).status).toBe(400);
  });

  test('every report is audited with who, what and scope', async () => {
    await postFin(fin());
    const data = prisma.auditLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ action: 'REPORT_GENERATED', actorId: 'user-1', entityType: 'REPORT', entityId: 'INCOME_STATEMENT', churchId: 'church-1' });
    expect(JSON.parse(data.changes)).toMatchObject({ reportType: 'INCOME_STATEMENT', scope: 'CHURCH' });
  });

  test('the account balance helper reads the right account for each scope', async () => {
    prisma.sectionFinancialAccount.findUnique.mockResolvedValue({ currentBalance: 7 });
    prisma.organizationFinancialAccount.findUnique.mockResolvedValue({ currentBalance: 8 });
    prisma.financialAccount.findFirst.mockResolvedValue({ currentBalance: 9 });
    const d = new Date();
    expect(await financialReportRepository.getAccountBalance('church-1', d, undefined, 'sec-1')).toBe(7);
    expect(await financialReportRepository.getAccountBalance('church-1', d, 'org-1')).toBe(8);
    expect(await financialReportRepository.getAccountBalance('church-1', d)).toBe(9);
    expect(prisma.financialAccount.findFirst.mock.calls[0][0].where).toEqual({ churchId: 'church-1', type: 'OPERATING' });
    prisma.financialAccount.findFirst.mockResolvedValue(null);
    expect(await financialReportRepository.getAccountBalance('church-1', d)).toBe(0);
  });
});

describe('export formats', () => {
  const data = () => { prisma.receipt.findMany.mockResolvedValue([{ id: 'r1', amount: 12.5, issuedAt: new Date('2026-01-02T00:00:00Z'), member: { firstName: 'Ann', lastName: 'Moyo, Jr' } }]); };
  const run = (format: string) => postFin(fin({ reportType: 'RECEIPT_DETAIL', format }));

  test('JSON is inspectable', async () => {
    data();
    const res = await run('JSON');
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body.data[0].id).toBe('r1');
  });

  test('CSV flattens nested records, quotes commas and downloads as an attachment', async () => {
    data();
    const res = await run('CSV');
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="receipt_detail-\d{4}-\d{2}-\d{2}\.csv"/);
    const [header, row] = res.text.split('\n');
    expect(header).toBe('id,amount,issuedAt,member.firstName,member.lastName');
    expect(row).toBe('r1,12.5,2026-01-02T00:00:00.000Z,Ann,"Moyo, Jr"');
  });

  test('XLSX is a zip workbook with the data in sheet1', async () => {
    data();
    const res = await run('XLSX').buffer(true).parse(binary);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    const files = unzipSync(new Uint8Array(res.body as Buffer));
    expect(Object.keys(files)).toContain('xl/worksheets/sheet1.xml');
    const sheet = Buffer.from(files['xl/worksheets/sheet1.xml']).toString();
    expect(sheet).toContain('Moyo, Jr');
    expect(sheet).toContain('<v>12.5</v>');
  });

  test('PDF starts with the PDF signature', async () => {
    data();
    const res = await run('PDF').buffer(true).parse(binary);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  test('the default format is PDF', async () => {
    data();
    const res = await postFin({ churchId: 'church-1', reportType: 'RECEIPT_DETAIL', ...dates }).buffer(true).parse(binary);
    expect(res.headers['content-type']).toBe('application/pdf');
  });

  test('empty reports still render in every format', async () => {
    prisma.receipt.findMany.mockResolvedValue([]);
    for (const format of ['CSV', 'XLSX', 'PDF', 'JSON']) {
      expect((await run(format).buffer(true).parse(binary)).status).toBe(200);
    }
  });

  test('cell values: dates, decimals, bigints and nested objects', async () => {
    const report = await reportingService.formatReport('X', [{ when: new Date('2026-01-01T00:00:00Z'), big: BigInt(5), arr: [1, 2], nothing: null }], 'csv');
    expect(report.content).toBe('when,big,arr,nothing\n2026-01-01T00:00:00.000Z,5,"[1,2]",');
    const scalar = await reportingService.formatReport('X', 5, 'CSV');
    expect(scalar.content).toBe('value\n5');
  });

  // Prisma Decimal fields (Receipt.amount, Expenditure.amount ...) are plain objects with own properties, so
  // flattenRecord() expands them into columns like amount.s / amount.e / amount.d instead of the number. cellValue() has a
  // toNumber branch, but it is never reached for nested values. Real receipts therefore export unusable amounts in CSV/XLSX/PDF.
  test('Decimal amounts export as a single numeric column', async () => {
    const { Prisma } = await import('@prisma/client');
    const report = await reportingService.formatReport('X', [{ id: 'r1', amount: new Prisma.Decimal('12.5') }], 'CSV');
    expect(String(report.content).split('\n')).toEqual(['id,amount', 'r1,12.5']);
  });

  // The legacy export neutralises cells starting with = + - @, so a member named
  // "=HYPERLINK(...)" becomes a live formula when the file is opened in a spreadsheet (the newer saved-report exporter escapes these).
  test('a bare Decimal row is a single value', async () => {
    const { Prisma } = await import('@prisma/client');
    expect((await reportingService.formatReport('X', new Prisma.Decimal('7.25'), 'CSV')).content).toBe('value\n7.25');
  });

  test('CSV cells that start with a formula character are neutralised', async () => {
    const report = await reportingService.formatReport('X', [{ name: '=HYPERLINK("http://evil","x")' }], 'CSV');
    expect(String(report.content).split('\n')[1]).toMatch(/^"?'/);
  });
});

describe('administrative reports', () => {
  // Organisations and sections named in a report are looked up first, so they default to belonging to this church.
  beforeEach(() => {
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', churchId: 'church-1' });
    prisma.section.findUnique.mockResolvedValue({ id: 'sec-1', churchId: 'church-1' });
  });

  test('church-wide membership summary counts by status inside the church', async () => {
    prisma.member.count.mockResolvedValueOnce(10).mockResolvedValueOnce(7).mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    const res = await postAdm(adm());
    expect(res.body.data).toMatchObject({ totalMembers: 10, activeMembers: 7, inactiveMembers: 2, deceased: 1, scope: 'Church-wide' });
    expect(prisma.member.count.mock.calls.every((c) => c[0].where.churchId === 'church-1')).toBe(true);
    await postAdm(adm({ membershipStatus: 'INACTIVE' }));
    expect(prisma.member.count.mock.calls[4][0].where).toEqual({ churchId: 'church-1', membershipStatus: 'INACTIVE' });
  });

  test('organisation and section summaries', async () => {
    prisma.organizationMembership.count.mockResolvedValue(4);
    prisma.member.count.mockResolvedValue(6);
    expect((await postAdm(adm({ organizationId: 'org-1' }))).body.data).toMatchObject({ totalMembers: 4, scope: 'Organization: org-1' });
    expect((await postAdm(adm({ sectionId: 'sec-1' }))).body.data).toMatchObject({ totalMembers: 6, scope: 'Section: sec-1' });
  });

  test('membership detail can be narrowed to an organisation', async () => {
    prisma.member.findMany.mockResolvedValue([
      { id: 'a', organizationMemberships: [{ organizationId: 'org-1' }] },
      { id: 'b', organizationMemberships: [{ organizationId: 'org-2' }] },
      { id: 'c' },
    ]);
    const res = await postAdm(adm({ reportType: 'MEMBERSHIP_DETAIL', organizationId: 'org-1', membershipStatus: 'ACTIVE' }));
    expect(res.body.data.map((m: any) => m.id)).toEqual(['a']);
    expect(prisma.member.findMany.mock.calls[0][0].where).toEqual({ churchId: 'church-1', membershipStatus: 'ACTIVE' });
  });

  test('attendance reports need a date range', async () => {
    expect((await postAdm(adm({ reportType: 'ATTENDANCE_SUMMARY' }))).status).toBe(400);
    expect((await postAdm(adm({ reportType: 'ATTENDANCE_DETAIL', startDate: dates.startDate }))).status).toBe(400);
  });

  test('attendance summary averages per event', async () => {
    prisma.event.findMany.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]);
    prisma.eventAttendance.count.mockResolvedValue(9);
    const res = await postAdm(adm({ reportType: 'ATTENDANCE_SUMMARY', ...dates }));
    expect(res.body.data).toMatchObject({ totalEvents: 2, totalAttendances: 9, averageAttendancePerEvent: 5, scope: 'Church-wide' });
    expect(prisma.event.findMany.mock.calls[0][0].where).toMatchObject({ churchId: 'church-1' });
    expect(prisma.eventAttendance.count.mock.calls[0][0].where).toEqual({ eventId: { in: ['e1', 'e2'] }, status: 'PRESENT' });
    prisma.event.findMany.mockResolvedValue([]);
    expect((await postAdm(adm({ reportType: 'ATTENDANCE_SUMMARY', ...dates }))).body.data).toMatchObject({ totalEvents: 0, attendanceRate: 0 });
  });

  test('attendance detail, leadership roster and demographics', async () => {
    prisma.eventAttendance.findMany.mockResolvedValue([]);
    prisma.leadershipAssignment.findMany.mockResolvedValue([]);
    prisma.organizationRoleAssignment.findMany.mockResolvedValue([]);
    prisma.member.count.mockResolvedValueOnce(4).mockResolvedValueOnce(1).mockResolvedValueOnce(3);
    await postAdm(adm({ reportType: 'ATTENDANCE_DETAIL', ...dates }));
    expect(prisma.eventAttendance.findMany.mock.calls[0][0].where).toEqual({ event: { startDateTime: { gte: new Date(dates.startDate), lte: new Date(dates.endDate) }, churchId: 'church-1' } });
    await postAdm(adm({ reportType: 'LEADERSHIP_ROSTER' }));
    expect(prisma.leadershipAssignment.findMany.mock.calls[0][0].where).toEqual({ churchId: 'church-1', sectionId: null, endDate: null });
    await postAdm(adm({ reportType: 'LEADERSHIP_ROSTER', organizationId: 'org-1' }));
    expect(prisma.organizationRoleAssignment.findMany.mock.calls[0][0].where).toEqual({ organizationId: 'org-1', endDate: null });
    const demo = await postAdm(adm({ reportType: 'DEMOGRAPHICS' }));
    expect(demo.body.data).toMatchObject({ totalMembers: 4, maleCount: 1, femaleCount: 3, femalePercentage: 75, malePercentage: 25 });
  });

  test('another church is refused; validation; audited with scope', async () => {
    expect([401, 403]).toContain((await postAdm(adm({ churchId: 'church-2' }))).status);
    expect((await postAdm(adm({ reportType: 'TRIAL_BALANCE' }))).status).toBe(400);
    prisma.member.count.mockResolvedValue(1);
    await postAdm(adm({ sectionId: 'sec-1' }));
    expect(JSON.parse(prisma.auditLog.create.mock.calls[0][0].data.changes)).toMatchObject({ scope: 'SECTION', sectionId: 'sec-1' });
  });

  // A section or organisation from another church (or one that does not exist) must not be readable by naming it
  // next to the caller's own churchId. The report answers 404 and no report query runs.
  const leaks: Array<[string, object, () => unknown[]]> = [
    ['membership detail of a foreign section', { reportType: 'MEMBERSHIP_DETAIL', sectionId: 'foreign-sec' }, () => prisma.member.findMany.mock.calls],
    ['membership summary of a foreign section', { reportType: 'MEMBERSHIP_SUMMARY', sectionId: 'foreign-sec' }, () => prisma.member.count.mock.calls],
    ['attendance detail of a foreign section', { reportType: 'ATTENDANCE_DETAIL', sectionId: 'foreign-sec', ...dates }, () => prisma.eventAttendance.findMany.mock.calls],
    ['leadership roster of a foreign organisation', { reportType: 'LEADERSHIP_ROSTER', organizationId: 'foreign-org' }, () => prisma.organizationRoleAssignment.findMany.mock.calls],
    ['membership summary of a foreign organisation', { reportType: 'MEMBERSHIP_SUMMARY', organizationId: 'foreign-org' }, () => prisma.organizationMembership.count.mock.calls],
  ];
  for (const [name, body, calls] of leaks) {
    test(`${name} is a 404 and nothing is queried`, async () => {
      prisma.section.findUnique.mockResolvedValue({ id: 'foreign-sec', churchId: 'church-2' });
      prisma.organization.findUnique.mockResolvedValue({ id: 'foreign-org', churchId: 'church-2' });
      const res = await postAdm(adm(body));
      expect(res.status).toBe(404);
      expect(calls()).toHaveLength(0);
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  }

  test('an unknown section or organisation is a 404 too', async () => {
    prisma.section.findUnique.mockResolvedValue(null);
    prisma.organization.findUnique.mockResolvedValue(null);
    expect((await postAdm(adm({ sectionId: 'nope' }))).status).toBe(404);
    expect((await postAdm(adm({ organizationId: 'nope' }))).status).toBe(404);
  });
});

describe('audit reports', () => {
  test('audit trail is limited to the church, the period and the chosen filters', async () => {
    prisma.auditLog.findMany.mockResolvedValue([{ id: 'l1', action: 'X' }]);
    const res = await postAud(aud({ entityType: 'MEMBER', entityId: 'm1', action: 'UPDATED' }));
    expect(res.status).toBe(200);
    const args = prisma.auditLog.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ churchId: 'church-1', entityType: 'MEMBER', entityId: 'm1', action: 'UPDATED' });
    expect(args.where.timestamp.gte.toISOString()).toBe(dates.startDate);
    expect(args).toMatchObject({ take: 1000, orderBy: { timestamp: 'desc' } });
    expect(JSON.parse(prisma.auditLog.create.mock.calls[0][0].data.changes)).toMatchObject({ scope: 'AUDIT' });
  });

  test('another church and unsupported types are refused', async () => {
    expect([401, 403]).toContain((await postAud(aud({ churchId: 'church-2' }))).status);
    expect((await postAud(aud({ reportType: 'INCOME_STATEMENT' }))).status).toBe(400);
    expect((await postAud({ ...aud(), startDate: undefined })).status).toBe(400);
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  test('exception report lists each data-quality problem it finds, inside the church', async () => {
    prisma.organizationMembership.groupBy.mockResolvedValue([{ memberId: 'm1' }]);
    prisma.member.count.mockResolvedValue(3);
    prisma.organizationMembership.findMany.mockResolvedValue([{ member: { id: 'm2' } }]);
    prisma.organization.findMany.mockResolvedValue([{ id: 'o1', name: 'Women' }]);
    const res = await postAud(aud({ reportType: 'EXCEPTION_REPORT' }));
    expect(res.body.data.map((e: any) => e.type)).toEqual(['DUPLICATE_MEMBERSHIP', 'UNASSIGNED_MEMBERS', 'AGED_OUT_YOUTH_MEMBERS', 'MISSING_TREASURER']);
    expect(res.body.data.find((e: any) => e.type === 'MISSING_TREASURER')).toMatchObject({ severity: 'HIGH', count: 1 });
    expect(prisma.organizationMembership.groupBy.mock.calls[0][0].where).toMatchObject({ member: { churchId: 'church-1' } });
    expect(prisma.member.count.mock.calls[0][0].where).toEqual({ churchId: 'church-1', sectionId: null, membershipStatus: 'ACTIVE' });
    expect(prisma.organizationMembership.findMany.mock.calls[0][0].where).toMatchObject({ organization: { churchId: 'church-1', organizationType: 'UMYF' }, member: { churchId: 'church-1' } });
    expect(prisma.organization.findMany.mock.calls[0][0].where).toMatchObject({ churchId: 'church-1', status: 'ACTIVE' });
  });

  test('a clean church has no exceptions', async () => {
    prisma.organizationMembership.groupBy.mockResolvedValue([]);
    prisma.member.count.mockResolvedValue(0);
    prisma.organizationMembership.findMany.mockResolvedValue([]);
    prisma.organization.findMany.mockResolvedValue([]);
    expect((await postAud(aud({ reportType: 'EXCEPTION_REPORT' }))).body.data).toEqual([]);
  });
});
