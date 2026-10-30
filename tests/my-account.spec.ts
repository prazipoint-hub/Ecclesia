import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
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

const prisma = mocked.prisma as ReturnType<typeof createMockPrisma>;
const app = createApp();

function tokenFor(claims: { memberId: string | null; sub?: string }) {
  return jwt.sign(
    { sub: claims.sub ?? 'user-1', email: 'a@example.com', churchId: 'church-1', memberId: claims.memberId, permissions: [], sessionId: 's1', tokenId: 't1' },
    jwtSecret,
    { expiresIn: '5m' }
  );
}

const auth = (memberId: string | null = 'member-1') => ({ Authorization: `Bearer ${tokenFor({ memberId })}` });

const profileRow = {
  id: 'member-1',
  churchId: 'church-1',
  familyId: 'family-1',
  membershipNumber: 'M20260001',
  firstName: 'Ada',
  middleName: null,
  lastName: 'Moyo',
  email: 'ada@example.com',
  phone: '0771',
  address: 'Harare',
  gender: 'FEMALE',
  dateOfBirth: new Date('1990-01-01'),
  maritalStatus: 'SINGLE',
  membershipStatus: 'ACTIVE',
  joinDate: new Date('2020-01-01'),
  membershipDate: new Date('2020-01-01'),
  isDependent: false,
  church: { id: 'church-1', name: 'Grace UMC' },
  section: { id: 'sec-1', name: 'East' },
  family: { id: 'family-1', name: 'Moyo family' },
  passwordHash: 'must-never-leak',
};

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 12));
const church = (id: string, amount: string, issuedAt: Date, extra: Record<string, unknown> = {}) => ({
  id,
  receiptNumber: `R-${id}`,
  amount: new Prisma.Decimal(amount),
  currency: 'USD',
  incomeType: 'TITHE',
  paymentMethod: 'CASH',
  status: 'ISSUED',
  issuedAt,
  fund: { name: 'General Fund' },
  ...extra,
});
const section = (id: string, amount: string, issuedAt: Date, extra: Record<string, unknown> = {}) => ({
  ...church(id, amount, issuedAt, { fund: undefined, section: { name: 'East' }, ...extra }),
});

function seedReceipts(churchRows: unknown[], sectionRows: unknown[]) {
  const rowsFor = (rows: unknown[]) => async (args: { select?: unknown }) =>
    args.select ? (rows as { issuedAt: Date }[]).map((r) => ({ issuedAt: r.issuedAt })) : rows;
  prisma.receipt.findMany.mockImplementation(rowsFor(churchRows));
  prisma.sectionReceipt.findMany.mockImplementation(rowsFor(sectionRows));
  prisma.receipt.count.mockResolvedValue(churchRows.length);
  prisma.sectionReceipt.count.mockResolvedValue(sectionRows.length);
}

beforeEach(() => {
  vi.resetAllMocks();
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops));
});

describe('access control', () => {
  test('requires authentication', async () => {
    expect((await request(app).get('/api/v2/me/profile')).status).toBe(401);
  });

  test('rejects accounts that are not linked to a member', async () => {
    const res = await request(app).get('/api/v2/me/profile').set(auth(null));
    expect(res.status).toBe(403);
    expect(prisma.member.findUnique).not.toHaveBeenCalled();
  });

  test('every query is scoped to the member in the token, never to client input', async () => {
    prisma.member.findUnique.mockResolvedValue(profileRow);
    seedReceipts([], []);
    await request(app).get('/api/v2/me/profile?id=member-2&memberId=member-2').set(auth('member-1'));
    await request(app).get('/api/v2/me/giving?memberId=member-2').set(auth('member-1'));
    expect(prisma.member.findUnique.mock.calls[0][0].where).toEqual({ id: 'member-1' });
    expect(prisma.receipt.findMany.mock.calls[0][0].where.memberId).toBe('member-1');
    expect(prisma.sectionReceipt.findMany.mock.calls[0][0].where.memberId).toBe('member-1');
  });

  test('responses are not cacheable', async () => {
    prisma.member.findUnique.mockResolvedValue(profileRow);
    const res = await request(app).get('/api/v2/me/profile').set(auth());
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('profile', () => {
  test('returns the profile without credentials or internal fields', async () => {
    prisma.member.findUnique.mockResolvedValue(profileRow);
    const res = await request(app).get('/api/v2/me/profile').set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ membershipNumber: 'M20260001', church: { name: 'Grace UMC' }, section: { name: 'East' } });
    expect(res.body).not.toHaveProperty('passwordHash');
    expect(res.body).not.toHaveProperty('churchId');
  });

  test.each([
    [{ membershipStatus: 'ACTIVE' }],
    [{ sectionId: 'sec-9' }],
    [{ firstName: 'Evil' }],
    [{ phone: '1', churchId: 'church-2' }],
    [{}],
    [{ email: 'not-an-email' }],
  ])('rejects invalid or forbidden update %j', async (body) => {
    prisma.member.findUnique.mockResolvedValue(profileRow);
    const res = await request(app).put('/api/v2/me/profile').set(auth()).send(body);
    expect(res.status).toBe(400);
    expect(prisma.member.update).not.toHaveBeenCalled();
  });

  test('updates only the fields that changed and writes an audit entry', async () => {
    prisma.member.findUnique.mockResolvedValue(profileRow);
    prisma.member.update.mockResolvedValue({});
    const res = await request(app).put('/api/v2/me/profile').set(auth()).send({ phone: '0772', address: 'Harare', email: 'ADA@example.com' });
    expect(res.status).toBe(200);
    expect(prisma.member.update).toHaveBeenCalledWith({ where: { id: 'member-1' }, data: { phone: '0772' } });
    const audit = prisma.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ action: 'MEMBER_SELF_UPDATED', entityId: 'member-1', actorId: 'member-1', churchId: 'church-1' });
    expect(JSON.parse(audit.previousState)).toEqual({ phone: '0771' });
  });

  test('blank phone clears it', async () => {
    prisma.member.findUnique.mockResolvedValue(profileRow);
    prisma.member.update.mockResolvedValue({});
    await request(app).put('/api/v2/me/profile').set(auth()).send({ phone: '  ' });
    expect(prisma.member.update).toHaveBeenCalledWith({ where: { id: 'member-1' }, data: { phone: null } });
  });

  test('no change means no write and no audit', async () => {
    prisma.member.findUnique.mockResolvedValue(profileRow);
    const res = await request(app).put('/api/v2/me/profile').set(auth()).send({ phone: '0771' });
    expect(res.status).toBe(200);
    expect(prisma.member.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  test('duplicate email becomes 409', async () => {
    prisma.member.findUnique.mockResolvedValue(profileRow);
    prisma.member.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    const res = await request(app).put('/api/v2/me/profile').set(auth()).send({ email: 'taken@example.com' });
    expect(res.status).toBe(409);
  });
});

describe('family', () => {
  test('maps relationships from the caller perspective', async () => {
    prisma.member.findUnique.mockResolvedValue(profileRow);
    const person = (id: string, firstName: string) => ({ id, firstName, lastName: 'Moyo', isDependent: false });
    prisma.familyRelationship.findMany.mockResolvedValue([
      { id: 'r1', partner1Id: 'member-1', partner2Id: 'p2', parentId: null, childId: null, partner1: person('member-1', 'Ada'), partner2: person('p2', 'Tendai'), parent: null, child: null },
      { id: 'r2', partner1Id: 'p3', partner2Id: 'member-1', parentId: null, childId: null, partner1: person('p3', 'Chipo'), partner2: person('member-1', 'Ada'), parent: null, child: null },
      { id: 'r3', partner1Id: null, partner2Id: null, parentId: 'member-1', childId: 'c1', partner1: null, partner2: null, parent: person('member-1', 'Ada'), child: person('c1', 'Kuda') },
      { id: 'r4', partner1Id: null, partner2Id: null, parentId: 'pa', childId: 'member-1', partner1: null, partner2: null, parent: person('pa', 'Baba'), child: person('member-1', 'Ada') },
    ]);
    prisma.member.findMany.mockResolvedValueOnce([person('c1', 'Kuda')]).mockResolvedValueOnce([]);

    const res = await request(app).get('/api/v2/me/family').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.relationships.map((r: { relationshipType: string; member: { id: string } }) => [r.relationshipType, r.member.id])).toEqual([
      ['SPOUSE', 'p2'],
      ['SPOUSE', 'p3'],
      ['CHILD', 'c1'],
      ['PARENT', 'pa'],
    ]);
    expect(res.body.dependents).toHaveLength(1);
    expect(res.body.family).toEqual({ id: 'family-1', name: 'Moyo family' });
  });

  test('household members never expose contact details', async () => {
    prisma.member.findUnique.mockResolvedValue(profileRow);
    prisma.familyRelationship.findMany.mockResolvedValue([]);
    prisma.member.findMany.mockResolvedValue([]);
    await request(app).get('/api/v2/me/family').set(auth());
    for (const call of prisma.member.findMany.mock.calls) {
      const select = call[0].select as Record<string, boolean>;
      expect(select).not.toHaveProperty('phone');
      expect(select).not.toHaveProperty('email');
      expect(select).not.toHaveProperty('address');
    }
  });
});

describe('giving', () => {
  test('merges church and section receipts newest first, with paging and years', async () => {
    seedReceipts(
      [church('c1', '10', utc(2026, 3, 1)), church('c2', '20', utc(2025, 12, 1))],
      [section('s1', '5', utc(2026, 5, 1))]
    );
    const res = await request(app).get('/api/v2/me/giving?page=1&pageSize=2').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { id: string }) => i.id)).toEqual(['s1', 'c1']);
    expect(res.body.items[0]).toMatchObject({ source: 'SECTION', sectionName: 'East', fundName: null, amount: 5 });
    expect(res.body.items[1]).toMatchObject({ source: 'CHURCH', fundName: 'General Fund' });
    expect(res.body.total).toBe(3);
    expect(res.body.availableYears).toEqual([2026, 2025]);

    const page2 = await request(app).get('/api/v2/me/giving?page=2&pageSize=2').set(auth());
    expect(page2.body.items.map((i: { id: string }) => i.id)).toEqual(['c2']);
  });

  test('filters by calendar year in UTC', async () => {
    seedReceipts([], []);
    await request(app).get('/api/v2/me/giving?year=2026').set(auth());
    const issuedAt = prisma.receipt.findMany.mock.calls[0][0].where.issuedAt;
    expect(issuedAt.gte.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(issuedAt.lt.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  test('rejects an absurd page size', async () => {
    expect((await request(app).get('/api/v2/me/giving?pageSize=100000').set(auth())).status).toBe(400);
  });

  test('summary counts only ISSUED receipts and sums decimals exactly', async () => {
    seedReceipts(
      [
        church('c1', '0.10', utc(2026, 1, 5)),
        church('c2', '0.20', utc(2026, 1, 12)),
        church('c3', '1000', utc(2026, 2, 1), { status: 'VOIDED' }),
        church('c4', '50', utc(2026, 2, 2), { incomeType: 'OFFERING', status: 'REVERSED' }),
        church('c5', '15.50', utc(2026, 6, 1), { incomeType: 'OFFERING', currency: 'ZWL' }),
      ],
      [section('s1', '4.40', utc(2026, 1, 20))]
    );
    const res = await request(app).get('/api/v2/me/giving/summary?year=2026').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.totals).toEqual([
      { currency: 'USD', total: 4.7, count: 3 },
      { currency: 'ZWL', total: 15.5, count: 1 },
    ]);
    expect(res.body.byIncomeType).toEqual([
      { incomeType: 'OFFERING', currency: 'ZWL', total: 15.5 },
      { incomeType: 'TITHE', currency: 'USD', total: 4.7 },
    ]);
    const usdMonths = res.body.byMonth.filter((m: { currency: string }) => m.currency === 'USD');
    expect(usdMonths).toHaveLength(12);
    expect(usdMonths[0]).toEqual({ month: 1, currency: 'USD', total: 4.7 });
    expect(usdMonths[1].total).toBe(0);
  });

  test('statement is a PDF download', async () => {
    prisma.member.findUnique.mockResolvedValue(profileRow);
    seedReceipts([church('c1', '25', utc(2026, 3, 1))], []);
    const res = await request(app).get('/api/v2/me/giving/statement?year=2026').set(auth()).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="giving-statement-2026.pdf"');
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('notifications', () => {
  test('merges system and pastoral notifications and reports unread', async () => {
    prisma.notification.findMany.mockResolvedValue([
      { id: 'n1', type: 'APPROVAL', title: 'Approved', body: 'ok', readAt: null, createdAt: utc(2026, 4, 2) },
    ]);
    prisma.pastoralNotification.findMany.mockResolvedValue([
      { id: 'p1', notificationType: 'PASTORAL_FOLLOWUP_DUE', title: 'Follow up', message: 'due', read: true, actionUrl: '/pastoral', createdAt: utc(2026, 4, 3) },
    ]);
    prisma.notification.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    prisma.pastoralNotification.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    const res = await request(app).get('/api/v2/me/notifications').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { id: string; source: string; read: boolean }) => [i.id, i.source, i.read])).toEqual([
      ['p1', 'PASTORAL', true],
      ['n1', 'SYSTEM', false],
    ]);
    expect(res.body).toMatchObject({ total: 2, unreadCount: 1 });
    expect(prisma.notification.findMany.mock.calls[0][0].where).toEqual({ recipientId: { in: ['user-1', 'member-1'] } });
    expect(prisma.pastoralNotification.findMany.mock.calls[0][0].where).toEqual({ pastorId: 'member-1' });
  });

  test('marking read only touches the caller own notifications', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app).put('/api/v2/me/notifications/n1/read').set(auth());
    expect(res.status).toBe(204);
    expect(prisma.notification.updateMany.mock.calls[0][0].where).toMatchObject({ id: 'n1', recipientId: { in: ['user-1', 'member-1'] } });
  });

  test('someone else notification is 404, not a silent success', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });
    prisma.pastoralNotification.updateMany.mockResolvedValue({ count: 0 });
    prisma.notification.count.mockResolvedValue(0);
    prisma.pastoralNotification.count.mockResolvedValue(0);
    expect((await request(app).put('/api/v2/me/notifications/other/read').set(auth())).status).toBe(404);
  });

  test('already-read notification is idempotent', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });
    prisma.pastoralNotification.updateMany.mockResolvedValue({ count: 0 });
    prisma.notification.count.mockResolvedValue(1);
    prisma.pastoralNotification.count.mockResolvedValue(0);
    expect((await request(app).put('/api/v2/me/notifications/n1/read').set(auth())).status).toBe(204);
  });

  test('read-all marks both tables for the caller', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 3 });
    prisma.pastoralNotification.updateMany.mockResolvedValue({ count: 1 });
    expect((await request(app).put('/api/v2/me/notifications/read-all').set(auth())).status).toBe(204);
    expect(prisma.notification.updateMany.mock.calls[0][0].where).toEqual({ recipientId: { in: ['user-1', 'member-1'] }, readAt: null });
    expect(prisma.pastoralNotification.updateMany.mock.calls[0][0].where).toEqual({ pastorId: 'member-1', read: false });
  });
});
