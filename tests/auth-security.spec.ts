import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMockPrisma } from './helpers/mockPrisma';

const mocked = vi.hoisted(() => ({ prisma: undefined as unknown, send: undefined as unknown }));

vi.mock('@/database', async () => {
  const { createMockPrisma: create } = await import('./helpers/mockPrisma');
  mocked.prisma = create();
  return { prisma: mocked.prisma, default: mocked.prisma };
});
vi.mock('@/services/email', () => {
  mocked.send = vi.fn().mockResolvedValue(undefined);
  return { emailService: { send: mocked.send } };
});

import { hashToken } from '@/features/auth/crypto';
import * as security from '@/features/auth/service/security';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/types/errors';

const prisma = mocked.prisma as ReturnType<typeof createMockPrisma>;
const send = mocked.send as ReturnType<typeof vi.fn>;
const future = () => new Date(Date.now() + 60_000);
const past = () => new Date(Date.now() - 60_000);

beforeEach(() => {
  vi.clearAllMocks();
  prisma.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops));
});

describe('requestPasswordReset', () => {
  test('does nothing and reveals nothing for an unknown email', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(security.requestPasswordReset('nobody@example.com')).resolves.toBeUndefined();
    expect(prisma.passwordReset.create).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  test('stores only a hash of the token and emails the raw token', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@example.com' });
    await security.requestPasswordReset('a@example.com');

    const stored = prisma.passwordReset.create.mock.calls[0][0].data;
    const emailed = send.mock.calls[0][0];
    const rawToken = /token=([0-9a-f]{64})/.exec(emailed.text)![1];
    expect(stored.tokenHash).toBe(hashToken(rawToken));
    expect(stored.tokenHash).not.toBe(rawToken);
    expect(emailed.to).toBe('a@example.com');
  });
});

describe('confirmPasswordReset', () => {
  test.each([
    ['unknown token', null],
    ['already used', { id: 'r', userId: 'u', usedAt: new Date(), expiresAt: future(), user: {} }],
    ['expired', { id: 'r', userId: 'u', usedAt: null, expiresAt: past(), user: {} }],
  ])('rejects %s', async (_label, record) => {
    prisma.passwordReset.findUnique.mockResolvedValue(record);
    await expect(security.confirmPasswordReset('t'.repeat(64), 'NewPassword#1')).rejects.toBeInstanceOf(ValidationError);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test('sets a new hashed password, consumes the token and revokes every session', async () => {
    prisma.passwordReset.findUnique.mockResolvedValue({
      id: 'r1',
      userId: 'u1',
      usedAt: null,
      expiresAt: future(),
      user: { churchId: null },
    });
    await security.confirmPasswordReset('t'.repeat(64), 'NewPassword#1');

    const userUpdate = prisma.user.update.mock.calls[0][0];
    expect(userUpdate.data.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(userUpdate.data.passwordHash).not.toContain('NewPassword#1');
    expect(prisma.passwordReset.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'r1' } }));
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });
});

describe('verifyEmail', () => {
  test('rejects expired tokens', async () => {
    prisma.emailVerification.findUnique.mockResolvedValue({ id: 'v', userId: 'u', verifiedAt: null, expiresAt: past() });
    await expect(security.verifyEmail('x'.repeat(64))).rejects.toBeInstanceOf(ValidationError);
  });

  test('marks user verified', async () => {
    prisma.emailVerification.findUnique.mockResolvedValue({ id: 'v', userId: 'u', verifiedAt: null, expiresAt: future() });
    await security.verifyEmail('x'.repeat(64));
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u' }, data: { emailVerified: true } });
  });
});

describe('createInvitation', () => {
  const actor = { id: 'admin', churchId: 'church-1', permissions: ['auth:invite:create'] };

  test('requires the invite permission', async () => {
    await expect(security.createInvitation({ ...actor, permissions: [] }, { email: 'a@example.com' })).rejects.toBeInstanceOf(ForbiddenError);
  });

  test('only matches members in the actor church', async () => {
    prisma.member.findFirst.mockResolvedValue(null);
    await expect(security.createInvitation(actor, { email: 'a@example.com', memberId: 'm9' })).rejects.toBeInstanceOf(NotFoundError);
    expect(prisma.member.findFirst.mock.calls[0][0].where).toEqual({ id: 'm9', churchId: 'church-1' });
  });

  test('refuses members that already have an account', async () => {
    prisma.member.findFirst.mockResolvedValue({ id: 'm1', user: { id: 'u1' } });
    await expect(security.createInvitation(actor, { email: 'a@example.com' })).rejects.toBeInstanceOf(ConflictError);
  });

  test('creates a hashed, expiring invitation and emails the raw token', async () => {
    prisma.member.findFirst.mockResolvedValue({ id: 'm1', user: null });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.church.findUnique.mockResolvedValue({ name: 'Grace UMC' });
    prisma.invitation.create.mockImplementation(async ({ data }: { data: { expiresAt: Date } }) => ({ id: 'i1', ...data }));

    const result = await security.createInvitation(actor, { email: 'A@Example.com' });

    expect(result.email).toBe('a@example.com');
    const stored = prisma.invitation.create.mock.calls[0][0].data;
    expect(stored.churchId).toBe('church-1');
    expect(stored.memberId).toBe('m1');
    expect(send.mock.calls[0][0].subject).toContain('Grace UMC');
    const rawToken = /token=([0-9a-f]{64})/.exec(send.mock.calls[0][0].text)![1];
    expect(stored.tokenHash).toBe(hashToken(rawToken));
  });
});

describe('acceptInvitation', () => {
  test.each([
    ['unknown', null],
    ['accepted', { acceptedAt: new Date(), revokedAt: null, expiresAt: future(), memberId: 'm' }],
    ['revoked', { acceptedAt: null, revokedAt: new Date(), expiresAt: future(), memberId: 'm' }],
    ['expired', { acceptedAt: null, revokedAt: null, expiresAt: past(), memberId: 'm' }],
  ])('rejects %s invitations', async (_label, record) => {
    prisma.invitation.findUnique.mockResolvedValue(record);
    await expect(security.acceptInvitation('t'.repeat(64), 'Password#123', {})).rejects.toBeInstanceOf(ValidationError);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});

describe('acceptInvitation with a scoped grant', () => {
  const base = { id: 'inv1', churchId: 'c1', email: 'a@example.com', memberId: 'm1', invitedBy: 'boss', acceptedAt: null, revokedAt: null, expiresAt: future() };

  test('creates the grant in the same statement as the account', async () => {
    prisma.invitation.findUnique.mockResolvedValue({ ...base, grantRoleId: 'r1', grantScopeType: 'CIRCUIT', grantScopeId: 'ci1' });
    prisma.user.create.mockResolvedValue({ id: 'u1' });
    await security.acceptInvitation('t'.repeat(64), 'Password#123', {}).catch(() => undefined); // session start is not under test
    expect(prisma.user.create.mock.calls[0][0].data.scopedRoles.create).toEqual({
      roleId: 'r1', scopeType: 'CIRCUIT', scopeId: 'ci1', sourceType: 'INVITATION', sourceId: 'inv1', createdBy: 'boss',
    });
  });

  test('an ordinary invitation carries no grant', async () => {
    prisma.invitation.findUnique.mockResolvedValue(base);
    prisma.user.create.mockResolvedValue({ id: 'u1' });
    await security.acceptInvitation('t'.repeat(64), 'Password#123', {}).catch(() => undefined);
    expect(prisma.user.create.mock.calls[0][0].data.scopedRoles).toBeUndefined();
  });
});

describe('devices', () => {
  test('revokeDevice only deletes devices owned by the caller', async () => {
    prisma.device.deleteMany.mockResolvedValue({ count: 0 });
    await expect(security.revokeDevice('u1', 'd-other', null)).rejects.toBeInstanceOf(NotFoundError);
    expect(prisma.device.deleteMany).toHaveBeenCalledWith({ where: { id: 'd-other', userId: 'u1' } });
  });

  test('listDevices flags the device owning the current session', async () => {
    prisma.device.findMany.mockResolvedValue([
      { id: 'd1', userAgent: 'a', ipAddress: '1', lastSeenAt: new Date(), createdAt: new Date(), sessions: [{ id: 's1' }] },
      { id: 'd2', userAgent: 'b', ipAddress: '2', lastSeenAt: new Date(), createdAt: new Date(), sessions: [{ id: 's2' }] },
    ]);
    const devices = await security.listDevices('u1', 's1');
    expect(devices.map((d) => [d.id, d.current])).toEqual([['d1', true], ['d2', false]]);
  });
});
