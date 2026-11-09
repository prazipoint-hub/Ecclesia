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

const prisma = mocked.prisma as ReturnType<typeof createMockPrisma>;
const app = createApp();
const as = (userId: string, memberId: string | null, ...permissions: string[]) => ({
  Authorization: `Bearer ${jwt.sign({ sub: userId, email: 'u@example.com', churchId: 'church-1', memberId, permissions, sessionId: 's1', tokenId: 't1' }, jwtSecret, { expiresIn: '5m' })}`,
});
const me = '/api/v2/me/profile-completion';
const adm = '/api/v2/profile-admin';
const member = (over: Record<string, unknown> = {}) => ({
  id: 'm1', churchId: 'church-1', firstName: 'A', lastName: 'B', phone: '0771', email: null, dateOfBirth: null, gender: 'MALE', maritalStatus: null, address: 'x', sectionId: null, nextOfKin: null, ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.auditLog.create.mockResolvedValue({});
  prisma.systemSetting.findUnique.mockResolvedValue(null);
  prisma.$transaction.mockImplementation((async (fn: (t: unknown) => unknown) => fn(prisma)) as never);
});

describe('completion rule', () => {
  test('percent comes from the default rule and lists the actual missing fields', async () => {
    prisma.member.findUnique.mockResolvedValue(member());
    const res = await request(app).get(me).set(as('u1', 'm1'));
    expect(res.status).toBe(200);
    // default rule: firstName,lastName,phone,dateOfBirth,gender,address,nextOfKin -> missing dateOfBirth, nextOfKin
    expect(res.body).toMatchObject({ ruleSource: 'default', missing: ['dateOfBirth', 'nextOfKin'], percent: 71 });
  });

  test('a church rule replaces the default; optional fields do not count', async () => {
    prisma.systemSetting.findUnique.mockResolvedValue({ value: ['firstName', 'phone'] });
    prisma.member.findUnique.mockResolvedValue(member({ dateOfBirth: null }));
    const res = await request(app).get(me).set(as('u1', 'm1'));
    expect(res.body).toMatchObject({ ruleSource: 'church', missing: [], percent: 100 });
  });

  test('a corrupt stored rule falls back to the default', async () => {
    prisma.systemSetting.findUnique.mockResolvedValue({ value: ['bogus'] });
    prisma.member.findUnique.mockResolvedValue(member());
    expect((await request(app).get(me).set(as('u1', 'm1'))).body.ruleSource).toBe('default');
  });

  test('setting the rule needs permission and valid fields', async () => {
    expect((await request(app).put(`${adm}/rule`).set(as('u1', 'm1')).send({ fields: ['phone'] })).status).toBe(403);
    const h = as('u1', 'm1', 'member:profile:configure');
    expect((await request(app).put(`${adm}/rule`).set(h).send({ fields: ['password'] })).status).toBe(400);
    prisma.systemSetting.upsert.mockResolvedValue({});
    expect((await request(app).put(`${adm}/rule`).set(h).send({ fields: ['phone', 'nextOfKin'] })).status).toBe(200);
  });

  test('a member cannot read another member through a supplied id; no memberId means 403', async () => {
    expect((await request(app).get(me).set(as('u1', null))).status).toBe(403);
    prisma.member.findUnique.mockResolvedValue(member({ churchId: 'church-2' }));
    expect((await request(app).get(me).set(as('u1', 'm1'))).status).toBe(404);
  });
});

describe('next of kin', () => {
  test('saves for the caller only and rejects unknown fields', async () => {
    prisma.member.findUnique.mockResolvedValue(member());
    prisma.memberNextOfKin.upsert.mockResolvedValue({});
    const ok = await request(app).put(`${me}/next-of-kin`).set(as('u1', 'm1')).send({ name: 'Sam Kin', relationship: 'Brother', phone: '0772000000' });
    expect(ok.status).toBe(200);
    expect(prisma.memberNextOfKin.upsert.mock.calls[0][0].where).toEqual({ memberId: 'm1' });
    expect((await request(app).put(`${me}/next-of-kin`).set(as('u1', 'm1')).send({ name: 'Sam Kin', relationship: 'Brother', phone: '0772000000', memberId: 'm9' })).status).toBe(400);
  });
});

describe('reviewed changes', () => {
  const req = (over: Record<string, unknown> = {}) => ({ id: 'r1', churchId: 'church-1', memberId: 'm1', field: 'gender', oldValue: 'MALE', newValue: 'FEMALE', status: 'PENDING', requestedBy: 'u1', ...over });

  test('a member submits a change; nothing on the member row is written', async () => {
    prisma.member.findUnique.mockResolvedValue(member());
    prisma.profileChangeRequest.findFirst.mockResolvedValue(null);
    prisma.profileChangeRequest.create.mockResolvedValue(req({ createdAt: new Date() }));
    const res = await request(app).post(`${me}/changes`).set(as('u1', 'm1')).send({ field: 'gender', value: 'FEMALE' });
    expect(res.status).toBe(201);
    expect(prisma.member.update).not.toHaveBeenCalled();
  });

  test('refuses unreviewable fields, bad dates, duplicates and no-ops', async () => {
    const h = as('u1', 'm1');
    prisma.member.findUnique.mockResolvedValue(member());
    expect((await request(app).post(`${me}/changes`).set(h).send({ field: 'membershipStatus', value: 'ACTIVE' })).status).toBe(400);
    expect((await request(app).post(`${me}/changes`).set(h).send({ field: 'dateOfBirth', value: '2026-13-01' })).status).toBe(400);
    expect((await request(app).post(`${me}/changes`).set(h).send({ field: 'gender', value: 'MALE' })).status).toBe(409);
    prisma.profileChangeRequest.findFirst.mockResolvedValue(req());
    expect((await request(app).post(`${me}/changes`).set(h).send({ field: 'gender', value: 'FEMALE' })).status).toBe(409);
  });

  test('a reviewer approves: claims, re-checks the old value, applies', async () => {
    prisma.profileChangeRequest.findUnique.mockResolvedValue(req());
    prisma.profileChangeRequest.updateMany.mockResolvedValue({ count: 1 });
    prisma.member.findUnique.mockResolvedValue(member());
    prisma.member.update.mockResolvedValue({});
    const res = await request(app).post(`${adm}/changes/r1/approve`).set(as('u2', 'm2', 'member:profile:review')).send({ note: 'checked register' });
    expect(res.status).toBe(200);
    expect(prisma.member.update.mock.calls[0][0]).toMatchObject({ where: { id: 'm1' }, data: { gender: 'FEMALE' } });
  });

  test('the member cannot approve their own request, even holding the permission', async () => {
    prisma.profileChangeRequest.findUnique.mockResolvedValue(req());
    const res = await request(app).post(`${adm}/changes/r1/approve`).set(as('u1', 'm1', 'member:profile:review')).send({ note: 'self approve' });
    expect(res.status).toBe(403);
    expect(prisma.profileChangeRequest.updateMany).not.toHaveBeenCalled();
  });

  test('a stale request is refused and nothing is applied', async () => {
    prisma.profileChangeRequest.findUnique.mockResolvedValue(req());
    prisma.profileChangeRequest.updateMany.mockResolvedValue({ count: 1 });
    prisma.member.findUnique.mockResolvedValue(member({ gender: 'FEMALE' }));
    expect((await request(app).post(`${adm}/changes/r1/approve`).set(as('u2', 'm2', 'member:profile:review')).send({ note: 'checked' })).status).toBe(409);
    expect(prisma.member.update).not.toHaveBeenCalled();
  });

  test('already reviewed loses the compare-and-set; another church is 404; reject writes nothing', async () => {
    const h = as('u2', 'm2', 'member:profile:review');
    prisma.profileChangeRequest.findUnique.mockResolvedValue(req());
    prisma.profileChangeRequest.updateMany.mockResolvedValue({ count: 0 });
    expect((await request(app).post(`${adm}/changes/r1/approve`).set(h).send({ note: 'checked' })).status).toBe(409);
    prisma.profileChangeRequest.findUnique.mockResolvedValue(req({ churchId: 'church-2' }));
    expect((await request(app).post(`${adm}/changes/r1/approve`).set(h).send({ note: 'checked' })).status).toBe(404);
    prisma.profileChangeRequest.findUnique.mockResolvedValue(req());
    prisma.profileChangeRequest.updateMany.mockResolvedValue({ count: 1 });
    expect((await request(app).post(`${adm}/changes/r1/reject`).set(h).send({ note: 'no evidence' })).status).toBe(200);
    expect(prisma.member.update).not.toHaveBeenCalled();
  });
});

describe('completion report', () => {
  test('returns counts only, no personal values', async () => {
    prisma.member.findMany.mockResolvedValue([member({ dateOfBirth: new Date() }), member({ phone: null }), member()]);
    const res = await request(app).get(`${adm}/report`).set(as('u2', 'm2', 'member:profile:report'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ activeMembers: 3, complete: 0 });
    expect(res.body.missingByField).toMatchObject({ dateOfBirth: 2, phone: 1, nextOfKin: 3 });
    expect(JSON.stringify(res.body)).not.toContain('0771');
    expect((await request(app).get(`${adm}/report`).set(as('u2', 'm2'))).status).toBe(403);
  });
});
