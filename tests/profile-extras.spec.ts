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

const prisma = mocked.prisma as ReturnType<typeof createMockPrisma>;
const app = createApp();
const as = (memberId: string | null, ...permissions: string[]) => ({
  Authorization: `Bearer ${jwt.sign({ sub: `u-${memberId ?? 'x'}`, email: 'u@example.com', churchId: 'church-1', memberId, permissions, sessionId: 's1', tokenId: 't1' }, jwtSecret, { expiresIn: '5m' })}`,
});
const me = '/api/v2/me/profile-completion';
const adm = '/api/v2/profile-admin';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);
const yearsAgo = (n: number) => new Date(Date.now() - n * 365.25 * 86_400_000);

beforeEach(() => {
  vi.resetAllMocks();
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.auditLog.create.mockResolvedValue({});
  prisma.$transaction.mockImplementation(async (fn: unknown) => (typeof fn === 'function' ? (fn as (tx: unknown) => unknown)(prisma) : fn));
});

describe('church-defined extra fields', () => {
  test('only configurators create them, and choice fields need choices', async () => {
    expect((await request(app).post(`${adm}/fields`).set(as('m1', 'member:view')).send({ key: 'baptism', label: 'Baptism date', fieldType: 'DATE' })).status).toBe(403);
    const bad = await request(app).post(`${adm}/fields`).set(as('m1', 'member:profile:configure')).send({ key: 'skill', label: 'Skill', fieldType: 'CHOICE' });
    expect(bad.status).toBe(400);
    prisma.profileFieldDefinition.create.mockResolvedValue({ id: 'f1', key: 'baptism', required: true });
    const ok = await request(app).post(`${adm}/fields`).set(as('m1', 'member:profile:configure')).send({ key: 'baptism', label: 'Baptism date', fieldType: 'DATE', required: true });
    expect(ok.status).toBe(201);
  });

  test('members fill them in; values are validated by type and never logged', async () => {
    prisma.member.findUnique.mockResolvedValue({ churchId: 'church-1' });
    prisma.profileFieldDefinition.findMany.mockResolvedValue([{ id: 'f1', key: 'baptism', label: 'Baptism date', fieldType: 'DATE', options: null }, { id: 'f2', key: 'skill', label: 'Skill', fieldType: 'CHOICE', options: ['Music', 'Tech'] }]);
    prisma.profileFieldValue.upsert.mockResolvedValue({});
    prisma.profileFieldValue.findMany.mockResolvedValue([]);
    const put = (values: Record<string, string>) => request(app).put(`${me}/fields`).set(as('m1')).send({ values });
    expect((await put({ nope: 'x' })).status).toBe(400);
    expect((await put({ baptism: 'yesterday' })).status).toBe(400);
    expect((await put({ skill: 'Cooking' })).status).toBe(400);
    expect((await put({ baptism: '2015-06-01', skill: 'Music' })).status).toBe(200);
    expect(prisma.profileFieldValue.upsert).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain('2015-06-01');
  });

  test('required extra fields lower the completion percentage until filled', async () => {
    prisma.member.findUnique.mockResolvedValue({ id: 'm1', churchId: 'church-1', firstName: 'A', lastName: 'B', phone: '1', dateOfBirth: new Date(), gender: 'M', address: 'x', nextOfKin: { name: 'n', relationship: 'r', phone: 'p', altPhone: null, address: null } });
    prisma.systemSetting.findUnique.mockResolvedValue(null);
    prisma.profileFieldDefinition.findMany.mockResolvedValue([{ id: 'f1', key: 'baptism' }]);
    prisma.profileFieldValue.findMany.mockResolvedValue([]);
    const res = await request(app).get(me).set(as('m1'));
    expect(res.body.missing).toEqual(['extra:baptism']);
    expect(res.body.percent).toBe(88); // 7 of 8
  });
});

describe('guardians of minors', () => {
  const links = { guardianMemberId: 'g1', minorMemberId: 'k1', relationship: 'PARENT' };
  test('an administrator links an adult to a child; adults and minors are checked by date of birth', async () => {
    expect((await request(app).post(`${adm}/guardians`).set(as('a1', 'member:view')).send(links)).status).toBe(403);
    prisma.member.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({ churchId: 'church-1', dateOfBirth: where.id === 'g1' ? yearsAgo(35) : yearsAgo(20) }));
    expect((await request(app).post(`${adm}/guardians`).set(as('a1', 'family:update')).send(links)).status).toBe(400); // 20 is not a minor
    prisma.member.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({ churchId: 'church-1', dateOfBirth: where.id === 'g1' ? yearsAgo(35) : yearsAgo(9) }));
    prisma.guardianLink.findUnique.mockResolvedValue(null);
    prisma.guardianLink.create.mockResolvedValue({ id: 'l1' });
    expect((await request(app).post(`${adm}/guardians`).set(as('a1', 'family:update')).send(links)).status).toBe(201);
    prisma.member.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({ churchId: 'church-1', dateOfBirth: where.id === 'g1' ? yearsAgo(15) : yearsAgo(9) }));
    expect((await request(app).post(`${adm}/guardians`).set(as('a1', 'family:update')).send(links)).status).toBe(400); // guardian is a child
  });

  test('a guardian can act for a child, a stranger cannot', async () => {
    prisma.guardianLink.findFirst.mockResolvedValue(null);
    expect((await request(app).put(`${me}/dependants/k1/next-of-kin`).set(as('x9')).send({ name: 'Aunt', relationship: 'AUNT', phone: '0771234567' })).status).toBe(404);
    prisma.guardianLink.findFirst.mockResolvedValue({ id: 'l1' });
    prisma.member.findUnique.mockResolvedValue({ churchId: 'church-1', dateOfBirth: yearsAgo(9) });
    prisma.memberNextOfKin.upsert.mockResolvedValue({});
    expect((await request(app).put(`${me}/dependants/k1/next-of-kin`).set(as('g1')).send({ name: 'Aunt', relationship: 'AUNT', phone: '0771234567' })).status).toBe(200);
    expect(prisma.memberNextOfKin.upsert.mock.calls[0][0].where).toEqual({ memberId: 'k1' });
  });

  test('guardian access ends when the child turns 18', async () => {
    prisma.guardianLink.findFirst.mockResolvedValue({ id: 'l1' });
    prisma.member.findUnique.mockResolvedValue({ churchId: 'church-1', dateOfBirth: yearsAgo(18.5) });
    expect((await request(app).get(`${me}/dependants/k1/fields`).set(as('g1'))).status).toBe(404);
  });

  test('a guardian\'s change to a reviewed field is filed for someone else to approve', async () => {
    prisma.guardianLink.findFirst.mockResolvedValue({ id: 'l1' });
    prisma.member.findUnique.mockResolvedValue({ id: 'k1', churchId: 'church-1', dateOfBirth: yearsAgo(9), gender: null });
    prisma.profileChangeRequest.findFirst.mockResolvedValue(null);
    prisma.profileChangeRequest.create.mockResolvedValue({ id: 'c1', field: 'gender', oldValue: null, newValue: 'FEMALE', status: 'PENDING', reviewNote: null, createdAt: new Date(), reviewedAt: null });
    const res = await request(app).post(`${me}/dependants/k1/changes`).set(as('g1')).send({ field: 'gender', value: 'FEMALE' });
    expect(res.status).toBe(201);
    expect(prisma.profileChangeRequest.create.mock.calls[0][0].data).toMatchObject({ memberId: 'k1', requestedBy: 'u-g1' });
  });
});

describe('profile photo', () => {
  test('stores a real image, identified by its bytes', async () => {
    prisma.memberPhoto.upsert.mockResolvedValue({});
    const res = await request(app).put(`${me}/photo`).set(as('m1')).set('Content-Type', 'image/png').send(PNG);
    expect(res.status).toBe(200);
    expect(res.body.mimeType).toBe('image/png');
    expect(prisma.memberPhoto.upsert.mock.calls[0][0].create.memberId).toBe('m1');
  });

  test('refuses a file that only claims to be an image, and files that are too big', async () => {
    const fake = await request(app).put(`${me}/photo`).set(as('m1')).set('Content-Type', 'image/png').send(Buffer.from('<script>alert(1)</script>'));
    expect(fake.status).toBe(400);
    const big = await request(app).put(`${me}/photo`).set(as('m1')).set('Content-Type', 'image/png').send(Buffer.concat([PNG, Buffer.alloc(310 * 1024)]));
    expect([400, 413]).toContain(big.status);
    expect(prisma.memberPhoto.upsert).not.toHaveBeenCalled();
  });

  test('is served with nosniff, only to the owner, a guardian or staff in the same church', async () => {
    prisma.memberPhoto.findUnique.mockResolvedValue({ mimeType: 'image/png', data: PNG, sha256: 'abc' });
    prisma.member.findUnique.mockResolvedValue({ churchId: 'church-1' });
    const own = await request(app).get(`${me}/photo`).set(as('m1'));
    expect(own.status).toBe(200);
    expect(own.headers['x-content-type-options']).toBe('nosniff');
    expect(own.headers['content-type']).toMatch(/image\/png/);
    prisma.guardianLink.findFirst.mockResolvedValue(null);
    expect((await request(app).get(`${adm}/members/m2/photo`).set(as('m1'))).status).toBe(404); // not staff, not guardian
    expect((await request(app).get(`${adm}/members/m2/photo`).set(as('m1', 'member:view'))).status).toBe(200);
    prisma.member.findUnique.mockResolvedValue({ churchId: 'other-church' });
    expect((await request(app).get(`${adm}/members/m2/photo`).set(as('m1', 'member:view'))).status).toBe(404);
  });
});
