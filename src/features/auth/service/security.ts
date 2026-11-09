import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '@/database';
import { logger } from '@/config/logger';
import { emailService } from '@/services/email';
import { invitationEmail, passwordResetEmail } from '@/services/email/templates';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/types/errors';
import type { AuthorizedUser } from '@/types';
import { generateToken, hashToken } from '@/features/auth/crypto';
import { startSessionForUser, type AuthResponse, type SessionContext } from '@/features/auth/service';
import { auditAuthEvent } from '@/features/auth/service/audit';
import { appointmentService } from '@/features/leadership/service/appointments';
import { sendVerificationEmail } from '@/features/auth/service/verification';

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;

async function safeSend(send: () => Promise<void>, context: Record<string, unknown>): Promise<void> {
  try {
    await send();
  } catch (error) {
    logger.error({ err: error, ...context }, 'Failed to send email');
  }
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return; // Never reveal whether an account exists.

  const { raw, hash } = generateToken();
  await prisma.passwordReset.deleteMany({ where: { userId: user.id, usedAt: null } });
  await prisma.passwordReset.create({
    data: { userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS) },
  });
  await safeSend(() => emailService.send(passwordResetEmail(user.email, raw)), { userId: user.id });
}

export async function confirmPasswordReset(token: string, newPassword: string): Promise<void> {
  const reset = await prisma.passwordReset.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!reset || reset.usedAt || reset.expiresAt <= new Date()) {
    throw new ValidationError('Invalid or expired reset token');
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await prisma.$transaction([
    prisma.user.update({ where: { id: reset.userId }, data: { passwordHash, emailVerified: true } }),
    prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
    prisma.session.deleteMany({ where: { userId: reset.userId } }),
  ]);
  await auditAuthEvent({
    churchId: reset.user.churchId,
    action: 'PASSWORD_RESET',
    entityType: 'USER',
    entityId: reset.userId,
    actorId: reset.userId,
  });
}

export async function changePassword(
  userId: string,
  currentSessionId: string | undefined,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User');
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new ValidationError('Current password is incorrect');
  }
  if (currentPassword === newPassword) throw new ValidationError('New password must differ from the current password');

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.session.deleteMany({ where: { userId, ...(currentSessionId ? { id: { not: currentSessionId } } : {}) } }),
  ]);
  await auditAuthEvent({
    churchId: user.churchId,
    action: 'PASSWORD_CHANGED',
    entityType: 'USER',
    entityId: userId,
    actorId: userId,
  });
}

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------

export async function verifyEmail(token: string): Promise<void> {
  const verification = await prisma.emailVerification.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!verification || verification.verifiedAt || verification.expiresAt <= new Date()) {
    throw new ValidationError('Invalid or expired verification token');
  }
  await prisma.$transaction([
    prisma.emailVerification.update({ where: { id: verification.id }, data: { verifiedAt: new Date() } }),
    prisma.user.update({ where: { id: verification.userId }, data: { emailVerified: true } }),
  ]);
}

export async function resendVerification(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User');
  if (user.emailVerified) return;
  await sendVerificationEmail(user.id, user.email);
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export async function createInvitation(
  actor: AuthorizedUser,
  input: { email: string; memberId?: string }
): Promise<{ id: string; email: string; expiresAt: Date }> {
  if (!actor.permissions.includes('auth:invite:create')) {
    throw new ForbiddenError('Forbidden: auth:invite:create permission required');
  }

  const email = input.email.toLowerCase();
  const member = await prisma.member.findFirst({
    where: input.memberId ? { id: input.memberId, churchId: actor.churchId } : { email, churchId: actor.churchId },
    include: { user: true },
  });
  if (!member) throw new NotFoundError('Member record in this church (create the member before inviting)');
  if (member.user) throw new ConflictError('This member already has an account');
  if (await prisma.user.findUnique({ where: { email } })) throw new ConflictError('An account already exists for this email');

  const church = await prisma.church.findUnique({ where: { id: actor.churchId } });
  const { raw, hash } = generateToken();
  await prisma.invitation.updateMany({
    where: { churchId: actor.churchId, email, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  const invitation = await prisma.invitation.create({
    data: {
      churchId: actor.churchId,
      email,
      memberId: member.id,
      invitedBy: actor.id,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    },
  });

  await safeSend(() => emailService.send(invitationEmail(email, raw, church?.name ?? 'your church')), { invitationId: invitation.id });
  await auditAuthEvent({
    churchId: actor.churchId,
    action: 'INVITATION_CREATED',
    entityType: 'INVITATION',
    entityId: invitation.id,
    actorId: actor.id,
    detail: { email, memberId: member.id },
  });
  return { id: invitation.id, email, expiresAt: invitation.expiresAt };
}

export async function revokeInvitation(actor: AuthorizedUser, invitationId: string): Promise<void> {
  if (!actor.permissions.includes('auth:invite:revoke')) {
    throw new ForbiddenError('Forbidden: auth:invite:revoke permission required');
  }
  const result = await prisma.invitation.updateMany({
    where: { id: invitationId, churchId: actor.churchId, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count === 0) throw new NotFoundError('Pending invitation');
  await auditAuthEvent({
    churchId: actor.churchId,
    action: 'INVITATION_REVOKED',
    entityType: 'INVITATION',
    entityId: invitationId,
    actorId: actor.id,
  });
}

export async function acceptInvitation(token: string, password: string, context: SessionContext): Promise<AuthResponse> {
  const invitation = await prisma.invitation.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) {
    throw new ValidationError('Invalid or expired invitation');
  }
  if (!invitation.memberId) throw new ValidationError('Invalid invitation');

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  let userId: string;
  try {
    const [user] = await prisma.$transaction([
      prisma.user.create({
        data: {
          email: invitation.email,
          passwordHash,
          churchId: invitation.churchId,
          memberId: invitation.memberId,
          emailVerified: true,
          // A scoped grant carried by the invitation is created in the same statement as the account, so it cannot be half-applied.
          ...(invitation.grantRoleId && invitation.grantScopeType && invitation.grantScopeId
            ? {
                scopedRoles: {
                  create: {
                    roleId: invitation.grantRoleId,
                    scopeType: invitation.grantScopeType,
                    scopeId: invitation.grantScopeId,
                    sourceType: 'INVITATION',
                    sourceId: invitation.id,
                    createdBy: invitation.invitedBy,
                  },
                },
              }
            : {}),
        },
      }),
      prisma.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } }),
    ]);
    userId = user.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError('An account already exists for this invitation');
    }
    throw error;
  }

  // Appointments made before this person had an account start granting access now (no-op when there are none).
  try {
    await appointmentService.syncGrantsForMember(invitation.memberId);
  } catch (error) {
    logger.error({ err: error, memberId: invitation.memberId }, 'Failed to sync appointment grants');
  }

  await auditAuthEvent({
    churchId: invitation.churchId,
    action: 'INVITATION_ACCEPTED',
    entityType: 'INVITATION',
    entityId: invitation.id,
    actorId: userId,
  });
  return startSessionForUser(userId, context);
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

export async function listDevices(userId: string, currentSessionId: string | undefined) {
  const devices = await prisma.device.findMany({
    where: { userId },
    orderBy: { lastSeenAt: 'desc' },
    include: { sessions: { select: { id: true } } },
  });
  return devices.map((device) => ({
    id: device.id,
    userAgent: device.userAgent,
    ipAddress: device.ipAddress,
    lastSeenAt: device.lastSeenAt,
    createdAt: device.createdAt,
    current: Boolean(currentSessionId && device.sessions.some((session) => session.id === currentSessionId)),
  }));
}

export async function revokeDevice(userId: string, deviceId: string, churchId: string | null): Promise<void> {
  const result = await prisma.device.deleteMany({ where: { id: deviceId, userId } });
  if (result.count === 0) throw new NotFoundError('Device');
  await auditAuthEvent({ churchId, action: 'DEVICE_REVOKED', entityType: 'DEVICE', entityId: deviceId, actorId: userId });
}
