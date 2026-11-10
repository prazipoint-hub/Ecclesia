import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { prisma } from '@/database';
import { jwtSecret } from '@/config/secrets';
import { AppError, ConflictError, ValidationError } from '@/types/errors';
import { activeAssignments, resolvePermissionNames, type RoleAssignment } from '@/features/auth/permissions';
import { acceptTwoFactorCode } from '@/features/auth/service/twoFactor';
import { sendVerificationEmail } from '@/features/auth/service/verification';
import { auditAuthEvent } from '@/features/auth/service/audit';
const accessTokenExpiry = (process.env.ACCESS_TOKEN_EXPIRY || process.env.JWT_EXPIRY || '15m') as SignOptions['expiresIn'];
const refreshTokenExpiry = process.env.REFRESH_TOKEN_EXPIRY || '7d';
const refreshTokenTtlMs = (() => {
  const match = /^(\d+)([mhd])$/.exec(refreshTokenExpiry);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const value = Number(match[1]);
  return value * ({ m: 60_000, h: 3_600_000, d: 86_400_000 } as const)[match[2] as 'm' | 'h' | 'd'];
})();

export type SessionContext = {
  userAgent?: string;
  ipAddress?: string;
  deviceId?: string | null;
};

// Real bcrypt hash of a random string, built lazily; keeps unknown-email logins as slow as real ones.
let dummyPasswordHash: string | undefined;
const getDummyPasswordHash = () => (dummyPasswordHash ??= bcrypt.hashSync(randomUUID(), 12));

type AuthUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  churchId: string | null;
  memberId: string | null;
  disabledAt?: Date | null;
  member: {
    firstName: string;
    lastName: string;
    leadershipAssignments: RoleAssignment[];
  } | null;
};

export type AuthResponse = {
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
    churchId?: string;
    firstName: string;
    lastName: string;
    permissions: string[];
    committees: [];
    sbus: [];
    organizationContexts: Array<{
      roleId: string;
      role: string;
      organizationId: string;
      organizationName: string;
      organizationLevel: 'CIRCUIT' | 'SECTION';
    }>;
    defaultContextId?: string;
  };
  token: string;
  refreshToken: string;
};

export type AccessTokenClaims = {
  sub: string;
  email: string;
  churchId: string | null;
  memberId: string | null;
  permissions: string[];
  sessionId: string;
  tokenId: string;
};

const clientUser = (user: AuthUser) => {
  const assignments = user.member?.leadershipAssignments ?? [];
  const contexts = activeAssignments(assignments).map((assignment) => ({
    roleId: assignment.id,
    role: assignment.role.name,
    organizationId: assignment.sectionId ?? user.churchId ?? '',
    organizationName: assignment.sectionId ? 'Section workspace' : 'Church workspace',
    organizationLevel: assignment.sectionId ? ('SECTION' as const) : ('CIRCUIT' as const),
  }));

  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    churchId: user.churchId ?? undefined,
    firstName: user.member?.firstName ?? 'Ecclesia',
    lastName: user.member?.lastName ?? 'Member',
    permissions: resolvePermissionNames(assignments),
    committees: [] as [],
    sbus: [] as [],
    organizationContexts: contexts,
    defaultContextId: contexts[0]?.roleId,
  };
};

async function getAuthUser(userId: string): Promise<AuthUser | null> {
  const now = new Date();
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      member: {
        include: {
          leadershipAssignments: {
            where: {
              startDate: { lte: now },
              OR: [{ endDate: null }, { endDate: { gt: now } }],
            },
            include: { role: { include: { permissions: { include: { permission: true } } } } },
          },
        },
      },
    },
  });
}

async function resolveDeviceId(userId: string, context: SessionContext): Promise<string | null> {
  const now = new Date();
  if (context.deviceId) {
    const touched = await prisma.device.updateMany({ where: { id: context.deviceId, userId }, data: { lastSeenAt: now } });
    if (touched.count > 0) return context.deviceId;
  }
  const userAgent = context.userAgent?.slice(0, 190) ?? null;
  const ipAddress = context.ipAddress?.slice(0, 190) ?? null;
  const existing = await prisma.device.findFirst({ where: { userId, userAgent, ipAddress } });
  if (existing) {
    await prisma.device.update({ where: { id: existing.id }, data: { lastSeenAt: now } });
    return existing.id;
  }
  const created = await prisma.device.create({ data: { userId, userAgent, ipAddress } });
  return created.id;
}

async function issueSession(user: AuthUser, context: SessionContext = {}): Promise<AuthResponse> {
  // Archived members keep their history but can no longer sign in or refresh a session.
  if ((user.member as { archivedAt?: Date | null } | null)?.archivedAt) throw new AppError(403, 'This account has been deactivated', 'ACCOUNT_ARCHIVED');
  // An administrator can switch an account off; it keeps its history but cannot sign in or refresh.
  if (user.disabledAt) throw new AppError(403, 'This account has been switched off. Contact your church administrator.', 'ACCOUNT_DISABLED');
  const userPayload = clientUser(user);
  const tokenId = randomUUID();
  const refreshToken = randomUUID();
  const deviceId = await resolveDeviceId(user.id, context);
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      deviceId,
      token: tokenId,
      refreshToken,
      expiresAt: new Date(Date.now() + refreshTokenTtlMs),
    },
  });

  const claims: AccessTokenClaims = {
    sub: user.id,
    email: user.email,
    churchId: user.churchId,
    memberId: user.memberId,
    permissions: userPayload.permissions,
    sessionId: session.id,
    tokenId,
  };
  const token = jwt.sign(claims, jwtSecret, { expiresIn: accessTokenExpiry });

  return { user: userPayload, token, refreshToken };
}

export async function startSessionForUser(userId: string, context: SessionContext = {}): Promise<AuthResponse> {
  const user = await getAuthUser(userId);
  if (!user) throw new Error('User not found');
  return issueSession(user, context);
}

export async function login(
  email: string,
  password: string,
  context: SessionContext & { totpCode?: string } = {}
): Promise<AuthResponse | null> {
  const user = await getAuthUserByEmail(email);
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? getDummyPasswordHash());
  if (!user || !passwordOk) return null;

  if (user.twoFactorSecret?.isEnabled) {
    const code = context.totpCode?.trim();
    if (!code) throw new AppError(401, 'Two-factor code required', 'TWO_FACTOR_REQUIRED');
    if (!(await acceptTwoFactorCode(user.id, user.twoFactorSecret, code))) {
      throw new AppError(401, 'Invalid two-factor code', 'INVALID_TWO_FACTOR_CODE');
    }
  }
  return issueSession(user, context);
}

async function getAuthUserByEmail(
  email: string
): Promise<
  | (AuthUser & {
      passwordHash: string;
      twoFactorSecret: { isEnabled: boolean; secretEncrypted: string; backupCodeHashes: string | null } | null;
    })
  | null
> {
  const now = new Date();
  return prisma.user.findUnique({
    where: { email },
    include: {
      twoFactorSecret: true,
      member: {
        include: {
          leadershipAssignments: {
            where: {
              startDate: { lte: now },
              OR: [{ endDate: null }, { endDate: { gt: now } }],
            },
            include: { role: { include: { permissions: { include: { permission: true } } } } },
          },
        },
      },
    },
  });
}

export async function register(
  email: string,
  password: string,
  churchId: string,
  context: SessionContext = {}
): Promise<AuthResponse> {
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) throw new ConflictError('A user account already exists for this email');

  // Claiming is by email only. If more than one unclaimed profile carries this email we cannot tell whose it is, so
  // nobody gets it automatically; an administrator must link the account. The answer is the same as "not found".
  const candidates = await prisma.member.findMany({ where: { email, churchId, user: null }, select: { id: true }, take: 2 });
  if (candidates.length !== 1) throw new ValidationError('A matching member record was not found in this church');
  const member = candidates[0];

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash, churchId, memberId: member.id },
  });
  const authUser = await getAuthUser(user.id);
  if (!authUser) throw new Error('Unable to create an authenticated user');
  await sendVerificationEmail(user.id, user.email);
  // The profile is linked before the email is verified, so the claim is recorded for review (no personal values logged).
  await auditAuthEvent({ churchId, action: 'MEMBER_PROFILE_CLAIMED', entityType: 'MEMBER', entityId: member.id, actorId: user.id });
  return issueSession(authUser, context);
}

export async function refresh(refreshToken: string, context: SessionContext = {}): Promise<AuthResponse | null> {
  const session = await prisma.session.findUnique({ where: { refreshToken } });
  if (!session || session.expiresAt <= new Date()) {
    if (session) await prisma.session.delete({ where: { id: session.id } });
    return null;
  }

  await prisma.session.delete({ where: { id: session.id } });
  const user = await getAuthUser(session.userId);
  return user ? issueSession(user, { ...context, deviceId: session.deviceId }) : null;
}

export async function getCurrentUser(userId: string) {
  const user = await getAuthUser(userId);
  return user ? clientUser(user) : null;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}
