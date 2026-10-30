import bcrypt from 'bcryptjs';
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
import { base32Encode, encryptSecret, hashToken, totp } from '@/features/auth/crypto';

const prisma = mocked.prisma as ReturnType<typeof createMockPrisma>;
const app = createApp();

const PASSWORD = 'Password#123';
const TOTP_SECRET = base32Encode(Buffer.from('12345678901234567890'));
const backupCode = 'abcde-12345';

function userRecord(twoFactor: boolean) {
  return {
    id: 'u1',
    email: 'a@example.com',
    emailVerified: true,
    passwordHash: bcrypt.hashSync(PASSWORD, 4),
    churchId: 'church-1',
    memberId: 'm1',
    member: { firstName: 'Ada', lastName: 'Moyo', leadershipAssignments: [] },
    twoFactorSecret: twoFactor
      ? { isEnabled: true, secretEncrypted: encryptSecret(TOTP_SECRET), backupCodeHashes: JSON.stringify([hashToken(backupCode)]) }
      : null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.device.findFirst.mockResolvedValue(null);
  prisma.device.create.mockResolvedValue({ id: 'd1' });
  prisma.session.create.mockResolvedValue({ id: 's1' });
});

describe('POST /api/v1/auth/login', () => {
  test('rejects wrong password with 401', async () => {
    prisma.user.findUnique.mockResolvedValue(userRecord(false));
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'a@example.com', password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  test('unknown email gets the same 401', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'x@example.com', password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  test('logs in without 2FA and records a device on the session', async () => {
    prisma.user.findUnique.mockResolvedValue(userRecord(false));
    const res = await request(app).post('/api/v1/auth/login').set('User-Agent', 'TestAgent/1').send({ email: 'A@Example.com', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.emailVerified).toBe(true);
    expect(prisma.device.create.mock.calls[0][0].data).toMatchObject({ userId: 'u1', userAgent: 'TestAgent/1' });
    expect(prisma.session.create.mock.calls[0][0].data.deviceId).toBe('d1');
  });

  test('asks for a code when 2FA is enabled', async () => {
    prisma.user.findUnique.mockResolvedValue(userRecord(true));
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'a@example.com', password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TWO_FACTOR_REQUIRED');
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  test('rejects an invalid 2FA code with a distinct code', async () => {
    prisma.user.findUnique.mockResolvedValue(userRecord(true));
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'a@example.com', password: PASSWORD, totpCode: '000000' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TWO_FACTOR_CODE');
  });

  test('accepts a valid TOTP code', async () => {
    prisma.user.findUnique.mockResolvedValue(userRecord(true));
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'a@example.com', password: PASSWORD, totpCode: totp(TOTP_SECRET, Date.now()) });
    expect(res.status).toBe(200);
  });

  test('accepts a backup code once and consumes it', async () => {
    prisma.user.findUnique.mockResolvedValue(userRecord(true));
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'a@example.com', password: PASSWORD, totpCode: backupCode });
    expect(res.status).toBe(200);
    expect(prisma.twoFactorSecret.update.mock.calls[0][0].data.backupCodeHashes).toBe('[]');
  });
});

describe('unauthenticated access', () => {
  test.each([
    ['get', '/api/v1/auth/devices'],
    ['post', '/api/v1/auth/password/change'],
    ['post', '/api/v1/auth/2fa/setup'],
    ['post', '/api/v1/auth/invite'],
  ])('%s %s requires a token', async (method, path) => {
    const res = await (request(app) as unknown as Record<string, (p: string) => request.Test>)[method](path);
    expect(res.status).toBe(401);
  });
});

describe('password reset endpoints', () => {
  test('request always answers 202, even for unknown emails', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/api/v1/auth/password-reset/request').send({ email: 'ghost@example.com' });
    expect(res.status).toBe(202);
  });

  test('confirm rejects a weak password before touching the database', async () => {
    const res = await request(app).post('/api/v1/auth/password-reset/confirm').send({ token: 'x'.repeat(64), password: 'short' });
    expect(res.status).toBe(400);
    expect(prisma.passwordReset.findUnique).not.toHaveBeenCalled();
  });

  test('confirm answers 400 for an invalid token', async () => {
    prisma.passwordReset.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/api/v1/auth/password-reset/confirm').send({ token: 'x'.repeat(64), password: 'LongEnough#1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid or expired/i);
  });
});
