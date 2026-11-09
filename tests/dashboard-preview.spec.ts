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
const sign = (claims: Record<string, unknown>) => ({ Authorization: `Bearer ${jwt.sign({ sub: 'admin', email: 'a@example.com', churchId: 'church-1', memberId: 'm-admin', sessionId: 's1', tokenId: 't1', ...claims }, jwtSecret, { expiresIn: '5m' })}` });
const admin = (...permissions: string[]) => sign({ permissions });
const role = (over: Record<string, unknown> = {}) => ({
  id: 'r1', churchId: 'church-1', name: 'Treasurer',
  permissions: ['finance:view', 'finance:journal:create', 'finance:cash_session:review', 'member:export', 'reports:view:all', 'finance:report'].map((name) => ({ permission: { name } })), ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.session.findUnique.mockResolvedValue({ id: 's1', userId: 'admin', token: 't1' });
  prisma.auditLog.create.mockResolvedValue({});
});

describe('view dashboard as', () => {
  test('needs access:preview and a role in the same church', async () => {
    expect((await request(app).post('/api/v2/access/preview').set(admin()).send({ roleId: 'r1' })).status).toBe(403);
    prisma.role.findUnique.mockResolvedValue(role({ churchId: 'church-2' }));
    expect((await request(app).post('/api/v2/access/preview').set(admin('access:preview')).send({ roleId: 'r1' })).status).toBe(404);
  });

  test('the token carries only read permissions, no member link, and is audited', async () => {
    prisma.role.findUnique.mockResolvedValue(role());
    const res = await request(app).post('/api/v2/access/preview').set(admin('access:preview')).send({ roleId: 'r1' });
    expect(res.status).toBe(201);
    expect(res.body.permissions.sort()).toEqual(['finance:report', 'finance:view', 'reports:view:all']);
    const claims = jwt.verify(res.body.token, jwtSecret) as Record<string, any>;
    expect(claims).toMatchObject({ sub: 'admin', memberId: null, preview: { roleId: 'r1', roleName: 'Treasurer' } });
    expect(claims.exp - claims.iat).toBe(900);
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('PREVIEW_STARTED');
  });

  test('every write is refused by the server under a preview token, reads still work', async () => {
    const preview = sign({ permissions: ['finance:view', 'finance:journal:create', 'finance:cash_session:review'], preview: { roleId: 'r1', roleName: 'Treasurer' }, memberId: null });
    for (const [method, url] of [['post', '/api/v2/accounting/cash-sessions/cs1/approve'], ['post', '/api/v2/accounting/deposits/d1/verify'], ['post', '/api/v2/access/assignments'], ['put', '/api/v2/me/profile'], ['delete', '/api/v2/access/assignments/a1']] as const) {
      const res = await (request(app) as any)[method](url).set(preview).send({});
      expect(res.status, `${method} ${url}`).toBe(403);
      expect(res.body.error).toContain('read-only preview');
    }
    prisma.deposit.findMany.mockResolvedValue([]);
    expect((await request(app).get('/api/v2/accounting/deposits').set(preview)).status).toBe(200);
  });

  test('a preview cannot start another preview, but can exit (audited)', async () => {
    const preview = sign({ permissions: ['access:preview'], preview: { roleId: 'r1', roleName: 'Treasurer' } });
    expect((await request(app).post('/api/v2/access/preview').set(preview).send({ roleId: 'r1' })).status).toBe(403);
    const out = await request(app).post('/api/v2/access/preview/exit').set(preview).send({});
    expect(out.status).toBe(200);
    expect(prisma.auditLog.create.mock.calls.at(-1)![0].data.action).toBe('PREVIEW_ENDED');
  });

  test('the preview dies with the administrator’s session', async () => {
    prisma.session.findFirst.mockResolvedValue(null);
    const preview = sign({ permissions: ['finance:view'], preview: { roleId: 'r1', roleName: 'x' } });
    expect((await request(app).get('/api/v2/accounting/deposits').set(preview)).status).toBe(401);
  });
});

describe('context verification', () => {
  test('answers from the database: held scope returns permissions, lost scope is 403', async () => {
    prisma.church.findUnique.mockResolvedValue({ circuitId: 'c1' });
    prisma.circuit.findUnique.mockResolvedValue({ id: 'c1', districtId: null });
    prisma.scopedRoleAssignment.findMany.mockResolvedValue([{ scopeType: 'CIRCUIT', scopeId: 'c1', role: { permissions: [{ permission: { name: 'circuit:view' } }] } }]);
    const ok = await request(app).post('/api/v2/access/context/verify').set(admin()).send({ type: 'CIRCUIT', id: 'c1' });
    expect(ok.status).toBe(200);
    expect(ok.body.permissions).toEqual(['circuit:view']);
    prisma.scopedRoleAssignment.findMany.mockResolvedValue([]);
    expect((await request(app).post('/api/v2/access/context/verify').set(admin()).send({ type: 'CIRCUIT', id: 'c1' })).status).toBe(403);
    expect((await request(app).post('/api/v2/access/context/verify').set(admin()).send({ type: 'PLANET', id: 'x' })).status).toBe(400);
  });
});
