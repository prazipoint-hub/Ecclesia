import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { prisma } from '@/database';
import { activeAssignments, resolvePermissionNames, type RoleAssignment } from '@/features/auth/permissions';

const jwtSecret = process.env.JWT_SECRET || 'ecclesia-dev-secret';
const accessTokenExpiry = (process.env.ACCESS_TOKEN_EXPIRY || process.env.JWT_EXPIRY || '15m') as SignOptions['expiresIn'];
const refreshTokenExpiry = process.env.REFRESH_TOKEN_EXPIRY || '7d';
const refreshTokenTtlMs = (() => {
  const match = /^(\d+)([mhd])$/.exec(refreshTokenExpiry);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const value = Number(match[1]);
  return value * ({ m: 60_000, h: 3_600_000, d: 86_400_000 } as const)[match[2] as 'm' | 'h' | 'd'];
})();

type AuthUser = {
  id: string;
  email: string;
  churchId: string | null;
  memberId: string | null;
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

async function issueSession(user: AuthUser): Promise<AuthResponse> {
  const userPayload = clientUser(user);
  const tokenId = randomUUID();
  const refreshToken = randomUUID();
  const session = await prisma.session.create({
    data: {
      userId: user.id,
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

export async function login(email: string, password: string): Promise<AuthResponse | null> {
  const user = await getAuthUserByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return null;
  return issueSession(user);
}

async function getAuthUserByEmail(email: string): Promise<(AuthUser & { passwordHash: string }) | null> {
  const now = new Date();
  return prisma.user.findUnique({
    where: { email },
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

export async function register(email: string, password: string, churchId: string): Promise<AuthResponse> {
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) throw new Error('A user account already exists for this email');

  const member = await prisma.member.findFirst({ where: { email, churchId, user: null } });
  if (!member) throw new Error('A matching member record was not found in this church');

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash, churchId, memberId: member.id },
  });
  const authUser = await getAuthUser(user.id);
  if (!authUser) throw new Error('Unable to create an authenticated user');
  return issueSession(authUser);
}

export async function refresh(refreshToken: string): Promise<AuthResponse | null> {
  const session = await prisma.session.findUnique({ where: { refreshToken } });
  if (!session || session.expiresAt <= new Date()) {
    if (session) await prisma.session.delete({ where: { id: session.id } });
    return null;
  }

  await prisma.session.delete({ where: { id: session.id } });
  const user = await getAuthUser(session.userId);
  return user ? issueSession(user) : null;
}

export async function getCurrentUser(userId: string) {
  const user = await getAuthUser(userId);
  return user ? clientUser(user) : null;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}
