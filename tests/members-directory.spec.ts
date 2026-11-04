import jwt from 'jsonwebtoken';
import request from 'supertest';
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
import { csvCell, parseCsv, toCsv } from '@/features/members/service/csv';

const prisma = mocked.prisma as ReturnType<typeof createMockPrisma>;
const app = createApp();
const YEAR = new Date().getFullYear();

const token = (permissions: string[] = [], memberId = 'member-1') =>
  jwt.sign({ sub: 'user-1', email: 'a@example.com', churchId: 'church-1', memberId, permissions, sessionId: 's1', tokenId: 't1' }, jwtSecret, { expiresIn: '5m' });
const as = (...permissions: string[]) => ({ Authorization: `Bearer ${token(permissions)}` });

beforeEach(() => {
  vi.resetAllMocks();
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.$transaction.mockImplementation((async (arg: unknown) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg as unknown[]))) as never);
  prisma.auditLog.create.mockResolvedValue({});
});

describe('csv helpers', () => {
  test('parses quotes, escaped quotes, embedded newlines, CRLF and a BOM', () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n"line1\nline2",z\r\n');
    expect(rows).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['line1\nline2', 'z']]);
  });

  test('ignores blank lines and rejects an unterminated quote', () => {
    expect(parseCsv('a,b\n\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
    expect(() => parseCsv('a,"b')).toThrow(/Unterminated/);
  });

  test.each(['=1+1', '+cmd', '-2', '@SUM(A1)', '\tx'])('defuses spreadsheet formula %j', (value) => {
    expect(csvCell(value).replace(/^"|"$/g, '')).toBe(`'${value}`);
  });

  test('quotes cells containing commas and quotes; round-trips', () => {
    const csv = toCsv(['n', 'v'], [['a,b', 'q"r'], [null, new Date('2026-03-04T10:00:00Z')]]);
    expect(csv).toBe('n,v\r\n"a,b","q""r"\r\n,2026-03-04\r\n');
    expect(parseCsv(csv)[1]).toEqual(['a,b', 'q"r']);
  });
});

describe('directory search', () => {
  const row = { id: 'm1', membershipNumber: 'M20260001', firstName: 'Ada', middleName: null, lastName: 'Moyo', email: null, phone: null, gender: 'FEMALE', membershipStatus: 'ACTIVE', joinDate: new Date(), archivedAt: null, isDependent: false, sectionId: 's1', section: { name: 'East' } };

  test('requires sign-in and member:view', async () => {
    expect((await request(app).get('/api/v2/members/search')).status).toBe(401);
    expect((await request(app).get('/api/v2/members/search').set(as())).status).toBe(403);
  });

  test('is scoped to the caller church, hides archived members and requires every word to match', async () => {
    prisma.member.findMany.mockResolvedValue([row]);
    prisma.member.count.mockResolvedValue(1);
    const res = await request(app).get('/api/v2/members/search?q=ada%20moyo&churchId=church-2').set(as('member:view'));
    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({ firstName: 'Ada', sectionName: 'East' });
    const where = prisma.member.findMany.mock.calls[0][0].where;
    expect(where.churchId).toBe('church-1');
    expect(where.archivedAt).toBeNull();
    expect(where.AND).toHaveLength(2);
    expect(where.AND[0].OR.map((o: object) => Object.keys(o)[0])).toEqual(['firstName', 'middleName', 'lastName', 'email', 'phone', 'membershipNumber']);
  });

  test('filters and archived modes map to the query', async () => {
    prisma.member.findMany.mockResolvedValue([]);
    prisma.member.count.mockResolvedValue(0);
    await request(app).get('/api/v2/members/search?status=ACTIVE&gender=MALE&sectionId=s9&archived=only&page=3&pageSize=10&sort=joined').set(as('member:view'));
    const call = prisma.member.findMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ membershipStatus: 'ACTIVE', gender: 'MALE', sectionId: 's9', archivedAt: { not: null } });
    expect(call).toMatchObject({ skip: 20, take: 10 });
    expect(call.orderBy[0]).toEqual({ joinDate: 'desc' });
  });

  test('archived=include applies no archive filter; bad paging is rejected', async () => {
    prisma.member.findMany.mockResolvedValue([]);
    prisma.member.count.mockResolvedValue(0);
    await request(app).get('/api/v2/members/search?archived=include').set(as('member:view'));
    expect(prisma.member.findMany.mock.calls[0][0].where).not.toHaveProperty('archivedAt');
    expect((await request(app).get('/api/v2/members/search?pageSize=1000').set(as('member:view'))).status).toBe(400);
  });
});

describe('export', () => {
  const exportRow = { membershipNumber: 'M1', firstName: '=HYPERLINK("http://evil")', middleName: null, lastName: 'Moyo', gender: 'FEMALE', dateOfBirth: new Date('1990-05-17'), phone: null, email: 'a@b.co', address: 'Main, St', section: { name: 'East' }, membershipStatus: 'ACTIVE', maritalStatus: null, membershipDate: new Date('2020-01-01'), archivedAt: null };

  test('needs member:export', async () => {
    expect((await request(app).get('/api/v2/members/export').set(as('member:view'))).status).toBe(403);
  });

  test('returns a CSV download with formula injection defused, and audits it', async () => {
    prisma.member.findMany.mockResolvedValue([exportRow]);
    const res = await request(app).get('/api/v2/members/export').set(as('member:export'));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="members-\d{4}-\d{2}-\d{2}\.csv"$/);
    const lines = res.text.trim().split('\r\n');
    expect(lines[0]).toBe('membershipNumber,firstName,middleName,lastName,gender,dateOfBirth,phone,email,address,section,membershipStatus,maritalStatus,membershipDate,archived');
    expect(lines[1]).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(lines[1]).toContain('"Main, St"');
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'MEMBER_EXPORTED', churchId: 'church-1' });
  });

  test('refuses to export an unbounded list', async () => {
    prisma.member.findMany.mockResolvedValue(Array.from({ length: 20001 }, () => exportRow));
    const res = await request(app).get('/api/v2/members/export').set(as('member:export'));
    expect(res.status).toBe(400);
  });
});

describe('import', () => {
  const HEADER = 'firstName,lastName,gender,dateOfBirth,email,section,membershipStatus';
  const preview = (csv: string, ...perms: string[]) => request(app).post('/api/v2/members/import/preview').set(as(...(perms.length ? perms : ['member:import']))).set('Content-Type', 'text/csv').send(csv);
  const run = (csv: string, query = '') => request(app).post(`/api/v2/members/import${query}`).set(as('member:import')).set('Content-Type', 'text/csv').send(csv);

  beforeEach(() => {
    prisma.section.findMany.mockResolvedValue([{ id: 's1', name: 'East' }]);
    prisma.member.findMany.mockResolvedValue([]);
    prisma.memberImport.create.mockResolvedValue({ id: 'imp-1' });
    prisma.member.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
  });

  test('needs member:import and a CSV body', async () => {
    expect((await preview(`${HEADER}\nAda,Moyo,,,,,`, 'member:view')).status).toBe(403);
    const res = await request(app).post('/api/v2/members/import/preview').set(as('member:import')).send({ csv: 'x' });
    expect(res.status).toBe(400);
  });

  test('requires the name columns and at least one row', async () => {
    expect((await preview('email\na@b.co')).status).toBe(400);
    expect((await preview(HEADER)).status).toBe(400);
  });

  test('rejects oversized imports', async () => {
    const big = `${HEADER}\n` + Array.from({ length: 5001 }, (_, i) => `A${i},B${i},,,,,`).join('\n');
    expect((await preview(big)).status).toBe(400);
  });

  test('reports row-level problems with row numbers and ignores unknown columns', async () => {
    const csv = [
      `${HEADER},nickname`,
      'Ada,Moyo,F,1990-05-17,ada@example.com,East,ACTIVE,adie',
      ',Dube,,,,,,',
      'Tendai,Ncube,MALE,17/05/1990,,,,',
      'Chipo,Sibanda,,,not-an-email,,,',
      'Kuda,Phiri,,,,Nowhere,,',
      'Rudo,Zulu,,,ada@example.com,,,',
      'Tino,Mlambo,,2999-01-01,,,,',
    ].join('\n');
    const res = await preview(csv);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ totalRows: 7, validRows: 1, errorCount: 6, ignoredColumns: ['nickname'] });
    const byRow = Object.fromEntries(res.body.errors.map((e: { row: number; message: string }) => [e.row, e.message]));
    expect(byRow[3]).toMatch(/first name/);
    expect(byRow[4]).toMatch(/dateOfBirth/);
    expect(byRow[5]).toMatch(/email/);
    expect(byRow[6]).toMatch(/Nowhere/);
    expect(byRow[7]).toMatch(/already used/);
    expect(byRow[8]).toMatch(/future/);
    expect(prisma.member.createMany).not.toHaveBeenCalled();
  });

  test('flags emails and people that already exist in the church', async () => {
    prisma.member.findMany.mockResolvedValue([
      { email: 'taken@example.com', firstName: 'X', lastName: 'Y', dateOfBirth: null },
      { email: null, firstName: 'Ada', lastName: 'Moyo', dateOfBirth: new Date('1990-05-17T00:00:00Z') },
    ]);
    const res = await preview([HEADER, 'New,Person,,,taken@example.com,,', 'ada,MOYO,,1990-05-17,,,'].join('\n'));
    expect(res.body.errorCount).toBe(2);
    expect(prisma.member.findMany.mock.calls[0][0].where.churchId).toBe('church-1');
  });

  test('a file with problems imports nothing unless invalid rows may be skipped', async () => {
    const csv = [HEADER, 'Ada,Moyo,,,,,', 'Bad,Row,,,nope,,'].join('\n');
    const res = await run(csv);
    expect(res.status).toBe(409);
    expect(prisma.member.createMany).not.toHaveBeenCalled();
    expect(prisma.memberImport.create).not.toHaveBeenCalled();
  });

  test('skipInvalid imports the good rows with sequential membership numbers and records the import', async () => {
    prisma.member.findMany
      .mockResolvedValueOnce([]) // duplicate check
      .mockResolvedValueOnce([{ membershipNumber: `M${YEAR}0009` }, { membershipNumber: `M${YEAR}0003` }, { membershipNumber: `M${YEAR}oops` }]); // numbering
    const csv = [HEADER, 'Ada,Moyo,F,1990-05-17,ada@example.com,east,ACTIVE', 'Tendai,Dube,male,,,,', 'Bad,Row,,,nope,,'].join('\n');
    const res = await run(csv, '?skipInvalid=true&fileName=people.csv');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'PARTIAL', totalRows: 3, imported: 2, skipped: 1 });
    const created = prisma.member.createMany.mock.calls[0][0].data;
    expect(created.map((m: { membershipNumber: string }) => m.membershipNumber)).toEqual([`M${YEAR}0010`, `M${YEAR}0011`]);
    expect(created[0]).toMatchObject({ churchId: 'church-1', firstName: 'Ada', gender: 'FEMALE', sectionId: 's1', email: 'ada@example.com' });
    expect(created[1]).toMatchObject({ gender: 'MALE', sectionId: null });
    expect(prisma.memberImport.create.mock.calls[0][0].data).toMatchObject({ fileName: 'people.csv', status: 'PARTIAL', imported: 2, skipped: 1, churchId: 'church-1' });
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('MEMBER_IMPORTED');
  });

  test('a clean file completes', async () => {
    prisma.member.findMany.mockResolvedValue([]);
    const res = await run([HEADER, 'Ada,Moyo,,,,,'].join('\n'));
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('COMPLETED');
  });

  test('history does not leak error logs', async () => {
    prisma.memberImport.findMany.mockResolvedValue([{ id: 'i1', fileName: 'a.csv', status: 'COMPLETED', totalRows: 1, imported: 1, skipped: 0, errorLog: '[...]', createdAt: new Date() }]);
    const res = await request(app).get('/api/v2/members/imports').set(as('member:import'));
    expect(res.body[0]).not.toHaveProperty('errorLog');
    expect(prisma.memberImport.findMany.mock.calls[0][0].where).toEqual({ churchId: 'church-1' });
  });
});

describe('archive and restore', () => {
  test('need member:archive', async () => {
    expect((await request(app).put('/api/v2/members/m2/archive').set(as())).status).toBe(403);
    expect((await request(app).put('/api/v2/members/m2/restore').set(as('member:view'))).status).toBe(403);
  });

  test("a member from another church is 404 and untouched", async () => {
    prisma.member.findUnique.mockResolvedValue({ id: 'm2', churchId: 'church-2', archivedAt: null });
    expect((await request(app).put('/api/v2/members/m2/archive').set(as('member:archive'))).status).toBe(404);
    expect(prisma.member.update).not.toHaveBeenCalled();
  });

  test('you cannot archive yourself', async () => {
    prisma.member.findUnique.mockResolvedValue({ id: 'member-1', churchId: 'church-1', archivedAt: null });
    expect((await request(app).put('/api/v2/members/member-1/archive').set(as('member:archive'))).status).toBe(409);
  });

  test('archiving stamps the member and signs them out everywhere', async () => {
    prisma.member.findUnique.mockResolvedValue({ id: 'm2', churchId: 'church-1', archivedAt: null });
    prisma.member.update.mockResolvedValue({ id: 'm2', archivedAt: new Date() });
    prisma.session.deleteMany.mockResolvedValue({ count: 2 });
    const res = await request(app).put('/api/v2/members/m2/archive').set(as('member:archive'));
    expect(res.status).toBe(200);
    expect(prisma.member.update.mock.calls[0][0].data).toMatchObject({ archivedBy: 'user-1' });
    expect(prisma.session.deleteMany.mock.calls[0][0].where).toEqual({ user: { memberId: 'm2' } });
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('MEMBER_ARCHIVED');
  });

  test('archiving twice and restoring a live member both conflict', async () => {
    prisma.member.findUnique.mockResolvedValue({ id: 'm2', churchId: 'church-1', archivedAt: new Date() });
    expect((await request(app).put('/api/v2/members/m2/archive').set(as('member:archive'))).status).toBe(409);
    prisma.member.findUnique.mockResolvedValue({ id: 'm2', churchId: 'church-1', archivedAt: null });
    expect((await request(app).put('/api/v2/members/m2/restore').set(as('member:archive'))).status).toBe(409);
  });

  test('restore clears the archive stamp', async () => {
    prisma.member.findUnique.mockResolvedValue({ id: 'm2', churchId: 'church-1', archivedAt: new Date() });
    prisma.member.update.mockResolvedValue({ id: 'm2', archivedAt: null });
    expect((await request(app).put('/api/v2/members/m2/restore').set(as('member:archive'))).status).toBe(200);
    expect(prisma.member.update.mock.calls[0][0].data).toEqual({ archivedAt: null, archivedBy: null });
  });
});
