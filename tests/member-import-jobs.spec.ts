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
import { findCandidates, parseRow, mapHeader, templateCsv } from '@/features/members/service/importTemplate';

const prisma = mocked.prisma as ReturnType<typeof createMockPrisma>;
const app = createApp();
const as = (...permissions: string[]) => ({
  Authorization: `Bearer ${jwt.sign({ sub: 'u1', email: 'u@example.com', churchId: 'church-1', memberId: 'm1', permissions, sessionId: 's1', tokenId: 't1' }, jwtSecret, { expiresIn: '5m' })}`,
});
const P = 'member:import';
const HEADER = 'name,surname,phone,sex,marital_status,baptism_status,confirmation_status,section,organization';
const upload = (csv: string, perms = [P]) => request(app).post('/api/v2/members/import-jobs?fileName=t.csv').set(as(...perms)).set('Content-Type', 'text/csv').send(csv);

beforeEach(() => {
  vi.resetAllMocks();
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.auditLog.create.mockResolvedValue({});
  prisma.$transaction.mockImplementation((async (arg: unknown) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg as unknown[]))) as never);
  prisma.section.findMany.mockResolvedValue([{ id: 'sec1', name: 'North' }]);
  prisma.organization.findMany.mockResolvedValue([{ id: 'o1', name: 'United Methodist Youth Fellowship', shortName: 'UMYF' }, { id: 'o2', name: 'Methodist Women', shortName: 'RRW' }]);
  prisma.member.findMany.mockResolvedValue([]);
  prisma.memberImportJob.findFirst.mockResolvedValue(null);
  prisma.memberImportJob.create.mockResolvedValue({ id: 'job1', fileName: 't.csv', status: 'PREVIEWED', totalRows: 0, templateVersion: '1.0', createdAt: new Date(), finishedAt: null });
  prisma.memberImportRow.createMany.mockResolvedValue({ count: 0 });
  prisma.memberImportRow.groupBy.mockResolvedValue([]);
});

describe('template and pure row rules', () => {
  test('template is the source header, and the spec endpoint documents allowed values', async () => {
    expect(templateCsv()).toBe(`${HEADER}\r\n`);
    const res = await request(app).get('/api/v2/members/import-jobs/template').set(as(P));
    expect(res.headers['x-template-version']).toBe('1.0');
    expect(res.text).toBe(`${HEADER}\r\n`);
    const spec = await request(app).get('/api/v2/members/import-jobs/template/spec').set(as(P));
    expect(spec.body.allowedValues.sex).toEqual(['MALE', 'FEMALE', 'OTHER']);
    expect((await request(app).get('/api/v2/members/import-jobs/template').set(as())).status).toBe(403);
  });

  test('blank optional cells are fine; nothing is invented', () => {
    const r = parseRow({ firstName: 'Tendai', lastName: 'Moyo' });
    expect(r.errors).toEqual([]);
    expect(r.parsed).toMatchObject({ phone: null, gender: null, maritalStatus: null, baptism: null });
  });

  test('validates enums, phone, unicode names, and warns about dropped leading zeros', () => {
    const bad = parseRow({ firstName: 'A', lastName: 'B', sex: 'x', maritalStatus: 'complicated', phone: 'abc', baptism: 'maybe' });
    expect(bad.errors).toHaveLength(4);
    const ok = parseRow({ firstName: 'Nyasha', lastName: 'Ñandu-Çelik', phone: '771 234 567', sex: 'f', baptism: 'true' });
    expect(ok.errors).toEqual([]);
    expect(ok.parsed).toMatchObject({ lastName: 'Ñandu-Çelik', phone: '771234567', gender: 'FEMALE', baptism: 'YES' });
    expect(ok.warnings.join(' ')).toMatch(/leading 0/);
    expect(ok.warnings.join(' ')).toMatch(/no sacrament record/);
    expect(parseRow({ firstName: 'A', lastName: 'B', phone: '0771 234 567' }).parsed!.phone).toBe('0771234567');
  });

  test('header mapping accepts the source names and reports missing and ignored columns', () => {
    const m = mapHeader(HEADER.split(','));
    expect(m.missing).toEqual([]);
    expect(mapHeader(['name', 'favourite colour']).missing).toEqual(['surname']);
    expect(mapHeader(['name', 'surname', 'favourite colour']).ignored).toEqual(['favourite colour']);
  });

  test('matching: shared phone alone is a warning; same name, or phone plus one name, is a candidate', () => {
    const pool = [{ id: 'm9', membershipNumber: 'M20260001', firstName: 'Ruth', lastName: 'Moyo', phone: '+263 77 123 4567' }];
    const p = (firstName: string, lastName: string, phone: string | null) => findCandidates({ firstName, lastName, phone }, pool);
    expect(p('Ruth', 'Moyo', null).matches[0].why).toBe('same name');
    expect(p('Ruth', 'Moyo', '0771234567').matches[0].why).toBe('same name and phone');
    expect(p('Tino', 'Moyo', '0771234567').matches[0].why).toBe('same phone and surname');
    const shared = p('Tino', 'Ncube', '0771234567');
    expect(shared.matches).toEqual([]);
    expect(shared.warnings[0]).toMatch(/shared numbers are allowed/);
    expect(p('Ruth', 'Moyo', '0779999999').matches).toHaveLength(1); // changed phone still found by name
  });
});

describe('staging a preview', () => {
  test('needs member:import and the required headings', async () => {
    expect((await upload(`${HEADER}\nA,B,,,,,,,`, [])).status).toBe(403);
    expect((await upload('name,phone\nA,1')).status).toBe(400);
  });

  test('preview writes only staging rows: no member, organisation membership or account', async () => {
    const csv = [HEADER, 'Tendai,Moyo,0771234567,M,single,yes,,North,UMYF;RRW', 'Bad,Row,abc,,,,,,', 'Ghost,Row,,,,,,Nowhere,', 'Zed,Zulu,,,,,,,Mystery', ''].join('\n');
    await upload(csv);
    expect(prisma.member.create).not.toHaveBeenCalled();
    expect(prisma.organizationMembership.createMany).not.toHaveBeenCalled();
    const rows = prisma.memberImportRow.createMany.mock.calls[0][0].data as Array<{ rowNumber: number; status: string; errors?: string }>;
    expect(rows.map((r) => [r.rowNumber, r.status])).toEqual([[2, 'VALID'], [3, 'REJECTED'], [4, 'REJECTED'], [5, 'REJECTED']]);
    expect(JSON.parse(rows[2].errors!)[0]).toContain('section: "Nowhere" does not exist');
    expect(JSON.parse(rows[3].errors!)[0]).toContain('organization: "Mystery" does not exist');
    expect(prisma.section.create).not.toHaveBeenCalled(); // unknown references are never created
  });

  test('flags duplicates inside the file and against existing members, as REVIEW rather than rejecting or merging', async () => {
    prisma.member.findMany.mockResolvedValue([{ id: 'm9', membershipNumber: 'M20260001', firstName: 'Ruth', lastName: 'Moyo', phone: null, email: null }]);
    const csv = [HEADER, 'Ruth,Moyo,,,,,,,', 'Tino,Ncube,0771111111,,,,,,', 'Tino,Ncube,0771111111,,,,,,', 'Tino,Ncube,0772222222,,,,,,', ''].join('\n');
    await upload(csv);
    const rows = prisma.memberImportRow.createMany.mock.calls[0][0].data as Array<{ status: string; reason?: string; matches?: string }>;
    expect(rows.map((r) => [r.status, r.reason ?? null])).toEqual([['REVIEW', 'POSSIBLE_MATCH'], ['VALID', null], ['REVIEW', 'DUPLICATE_IN_FILE'], ['REVIEW', 'DUPLICATE_IN_FILE']]);
    expect(rows[0].matches).toContain('M20260001');
    // One query loads every candidate, not one per row.
    expect(prisma.member.findMany).toHaveBeenCalledTimes(1);
  });

  test('uploading identical content again returns the same job instead of staging twice', async () => {
    prisma.memberImportJob.findFirst.mockResolvedValue({ id: 'job1', fileName: 't.csv', status: 'COMPLETED', totalRows: 1, templateVersion: '1.0', createdAt: new Date(), finishedAt: new Date() });
    const res = await upload(`${HEADER}\nA,B,,,,,,,\n`);
    expect(res.status).toBe(200);
    expect(res.body.reused).toBe(true);
    expect(prisma.memberImportJob.create).not.toHaveBeenCalled();
  });

  test('handles a UTF-8 BOM and quoted Unicode fields', async () => {
    await upload(`﻿${HEADER}\n"Nyasha ""Nash""","Ñandu, Jr",,,,,,,\n`);
    const row = prisma.memberImportRow.createMany.mock.calls[0][0].data[0] as { status: string; parsed: string };
    expect(row.status).toBe('VALID');
    expect(JSON.parse(row.parsed)).toMatchObject({ firstName: 'Nyasha "Nash"', lastName: 'Ñandu, Jr' });
  });
});

describe('decisions, tenancy and confirm', () => {
  const job = (over: Record<string, unknown> = {}) => ({ id: 'job1', kind: 'MEMBERS', churchId: 'church-1', fileName: 't.csv', status: 'PREVIEWED', totalRows: 3, templateVersion: '1.0', createdAt: new Date(), finishedAt: null, startedAt: null, ...over });
  const parsed = (n: string, o: Partial<{ sectionName: string; organizationNames: string[] }> = {}) =>
    JSON.stringify({ firstName: n, lastName: 'Zulu', middleName: null, phone: null, gender: null, maritalStatus: null, baptism: null, confirmation: null, sectionName: null, organizationNames: [], email: null, address: null, dateOfBirth: null, ...o });
  const confirm = (body: object = {}) => request(app).post('/api/v2/members/import-jobs/job1/confirm').set(as(P)).send(body);

  test("another church's job looks missing", async () => {
    prisma.memberImportJob.findUnique.mockResolvedValue(job({ churchId: 'other' }));
    expect((await request(app).get('/api/v2/members/import-jobs/job1').set(as(P))).status).toBe(404);
    expect((await confirm()).status).toBe(404);
    expect(prisma.memberImportJob.updateMany).not.toHaveBeenCalled();
  });

  test('decisions only touch rows still awaiting review', async () => {
    prisma.memberImportJob.findUnique.mockResolvedValue(job());
    prisma.memberImportRow.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app).put('/api/v2/members/import-jobs/job1/decisions').set(as(P)).send({ decisions: [{ row: 3, decision: 'CREATE' }, { row: 4, decision: 'SKIP' }] });
    expect(res.body).toEqual({ updated: 2, ignored: 0 });
    expect(prisma.memberImportRow.updateMany.mock.calls[0][0].where).toMatchObject({ jobId: 'job1', status: 'REVIEW' });
    expect((await request(app).put('/api/v2/members/import-jobs/job1/decisions').set(as(P)).send({ decisions: [{ row: 3, decision: 'MERGE' }] })).status).toBe(400);
  });

  test('confirm is refused while rows await a decision, and nothing is written', async () => {
    prisma.memberImportJob.findUnique.mockResolvedValue(job());
    prisma.memberImportRow.findMany.mockResolvedValue([]);
    prisma.memberImportRow.count.mockResolvedValue(2);
    const res = await confirm();
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('2 row(s) need a decision');
    expect(prisma.memberImportJob.updateMany).not.toHaveBeenCalled();
    expect(prisma.member.create).not.toHaveBeenCalled();
  });

  test('confirm revalidates: a person added since the preview turns the row into REVIEW and blocks the run', async () => {
    prisma.memberImportJob.findUnique.mockResolvedValue(job());
    prisma.memberImportRow.findMany.mockResolvedValueOnce([{ id: 'r1', rowNumber: 2, parsed: parsed('Tino') }]);
    prisma.member.findMany.mockResolvedValue([{ id: 'm9', membershipNumber: 'M1', firstName: 'Tino', lastName: 'Zulu', phone: null, email: null }]);
    prisma.memberImportRow.updateMany.mockResolvedValue({ count: 1 });
    const res = await confirm();
    expect(res.status).toBe(409);
    expect(prisma.memberImportRow.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'r1', status: 'VALID' }, data: { status: 'REVIEW', reason: 'POSSIBLE_MATCH' } });
    expect(prisma.member.create).not.toHaveBeenCalled();
  });

  test('a second concurrent confirm cannot claim the job', async () => {
    prisma.memberImportJob.findUnique.mockResolvedValue(job());
    prisma.memberImportRow.findMany.mockResolvedValue([]);
    prisma.memberImportRow.count.mockResolvedValue(0);
    prisma.memberImportJob.updateMany.mockResolvedValue({ count: 0 });
    expect((await confirm()).status).toBe(409);
    expect(prisma.member.create).not.toHaveBeenCalled();
    // The claim is a compare-and-set that also allows taking over a run that stopped heartbeating.
    expect(JSON.stringify(prisma.memberImportJob.updateMany.mock.calls[0][0].where)).toContain('heartbeatAt');
  });

  test('imports in batches: member + organisation links + IMPORTED mark share one transaction; reconciliation adds up', async () => {
    const rows = [
      { id: 'r1', rowNumber: 2, status: 'VALID', parsed: parsed('Anna', { sectionName: 'North', organizationNames: ['UMYF', 'RRW'] }) },
      { id: 'r2', rowNumber: 3, status: 'REVIEW', decision: 'CREATE', parsed: parsed('Ben') },
    ];
    prisma.memberImportJob.findUnique.mockResolvedValueOnce(job()).mockResolvedValue(job({ status: 'PROCESSING' }));
    prisma.memberImportRow.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce(rows).mockResolvedValue([]);
    prisma.memberImportRow.count.mockResolvedValue(0);
    prisma.memberImportJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.memberImportJob.update.mockResolvedValue({});
    prisma.memberImportRow.updateMany.mockResolvedValue({ count: 0 });
    prisma.member.create.mockResolvedValueOnce({ id: 'mA' }).mockResolvedValueOnce({ id: 'mB' });
    prisma.organizationMembership.createMany.mockResolvedValue({ count: 2 });
    prisma.memberImportRow.update.mockResolvedValue({});
    prisma.memberImportRow.groupBy.mockResolvedValue([{ status: 'IMPORTED', decision: null, _count: { _all: 2 } }, { status: 'REJECTED', decision: null, _count: { _all: 1 } }]);
    const res = await confirm();
    expect(res.status).toBe(200);
    expect(prisma.member.create.mock.calls[0][0].data).toMatchObject({ churchId: 'church-1', sectionId: 'sec1', firstName: 'Anna', membershipStatus: 'ACTIVE' });
    expect(prisma.organizationMembership.createMany.mock.calls[0][0].data).toEqual([{ organizationId: 'o1', memberId: 'mA' }, { organizationId: 'o2', memberId: 'mA' }]);
    expect(prisma.memberImportRow.update.mock.calls.map((c) => c[0].data)).toEqual([{ status: 'IMPORTED', memberId: 'mA' }, { status: 'IMPORTED', memberId: 'mB' }]);
    expect(res.body).toMatchObject({ status: 'COMPLETED', reconciles: true, remaining: 0, counts: { totalRows: 3, imported: 2, rejected: 1 } });
    // One person, two organisations: still one member record.
    expect(prisma.member.create).toHaveBeenCalledTimes(2);
    expect(prisma.auditLog.create.mock.calls.map((c) => c[0].data.action)).toContain('MEMBER_IMPORT_FINISHED');
  });

  test('a batch that fails is marked FAILED, the job stays PARTIAL, and it is never reported as complete', async () => {
    prisma.memberImportJob.findUnique.mockResolvedValueOnce(job()).mockResolvedValue(job({ status: 'PROCESSING' }));
    prisma.memberImportRow.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'r1', rowNumber: 2, status: 'VALID', parsed: parsed('Anna') }]).mockResolvedValue([]);
    prisma.memberImportRow.count.mockResolvedValue(0);
    prisma.memberImportJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.memberImportJob.update.mockResolvedValue({});
    prisma.memberImportRow.updateMany.mockResolvedValue({ count: 1 });
    prisma.member.create.mockRejectedValue(new Error('db down'));
    prisma.memberImportRow.groupBy.mockResolvedValue([{ status: 'FAILED', decision: null, _count: { _all: 1 } }]);
    const res = await confirm();
    expect(res.body).toMatchObject({ status: 'PARTIAL', remaining: 1, counts: { failed: 1, imported: 0 } });
    const failMark = prisma.memberImportRow.updateMany.mock.calls.find((c) => c[0].data.status === 'FAILED');
    expect(failMark![0].where).toEqual({ id: { in: ['r1'] } });
  });

  test('a membership-number collision between two imports retries with fresh numbers', async () => {
    prisma.memberImportJob.findUnique.mockResolvedValueOnce(job()).mockResolvedValue(job({ status: 'PROCESSING' }));
    prisma.memberImportRow.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'r1', rowNumber: 2, status: 'VALID', parsed: parsed('Anna') }]).mockResolvedValue([]);
    prisma.memberImportRow.count.mockResolvedValue(0);
    prisma.memberImportJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.memberImportJob.update.mockResolvedValue({});
    prisma.memberImportRow.updateMany.mockResolvedValue({ count: 0 });
    prisma.member.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 't' })).mockResolvedValue({ id: 'mA' });
    prisma.memberImportRow.update.mockResolvedValue({});
    prisma.memberImportRow.groupBy.mockResolvedValue([{ status: 'IMPORTED', decision: null, _count: { _all: 3 } }]);
    const res = await confirm();
    expect(prisma.member.create).toHaveBeenCalledTimes(2);
    expect(res.body.status).toBe('COMPLETED');
  });

  test('confirming a completed job again is a harmless no-op', async () => {
    prisma.memberImportJob.findUnique.mockResolvedValue(job({ status: 'COMPLETED', finishedAt: new Date() }));
    prisma.memberImportRow.groupBy.mockResolvedValue([{ status: 'IMPORTED', decision: null, _count: { _all: 3 } }]);
    const res = await confirm();
    expect(res.status).toBe(200);
    expect(prisma.member.create).not.toHaveBeenCalled();
    expect(prisma.memberImportJob.updateMany).not.toHaveBeenCalled();
  });

  test('cancel only works before processing and deletes the staged personal data', async () => {
    prisma.memberImportJob.findUnique.mockResolvedValue(job());
    prisma.memberImportJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.memberImportRow.deleteMany.mockResolvedValue({ count: 3 });
    expect((await request(app).post('/api/v2/members/import-jobs/job1/cancel').set(as(P))).status).toBe(200);
    expect(prisma.memberImportRow.deleteMany).toHaveBeenCalledWith({ where: { jobId: 'job1' } });
    prisma.memberImportJob.updateMany.mockResolvedValue({ count: 0 });
    expect((await request(app).post('/api/v2/members/import-jobs/job1/cancel').set(as(P))).status).toBe(409);
  });

  test('the problems report returns original values with formula-safe cells', async () => {
    prisma.memberImportJob.findUnique.mockResolvedValue(job());
    prisma.memberImportRow.findMany.mockResolvedValue([{ rowNumber: 3, raw: JSON.stringify({ name: '=HYPERLINK("x")', surname: 'Row' }), errors: JSON.stringify(['phone: bad']) }]);
    const res = await request(app).get('/api/v2/members/import-jobs/job1/problems.csv').set(as(P));
    expect(res.text).toContain("'=HYPERLINK");
    expect(res.text).toContain('phone: bad');
    expect(res.headers['content-type']).toContain('text/csv');
  });
});
