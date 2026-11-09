import { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest, AuthorizedUser } from '@/types';
import { prisma } from '@/database';
import { jwtSecret as JWT_SECRET } from '@/config/secrets';
import { logger } from '@/config/logger';

const DEVICE_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: missing bearer token' });
    return;
  }

  try {
    const token = header.replace('Bearer ', '');
    const payload = jwt.verify(token, JWT_SECRET) as Partial<AuthorizedUser> & {
      sub?: string;
      churchId?: string;
      permissions?: string[];
      sessionId?: string;
      tokenId?: string;
      preview?: { roleId: string; roleName: string };
    };

    if (!payload.sub || !payload.sessionId || !payload.tokenId) {
      res.status(401).json({ error: 'Unauthorized: invalid token' });
      return;
    }

    const session = await prisma.session.findFirst({
      where: { id: payload.sessionId, userId: payload.sub, token: payload.tokenId, expiresAt: { gt: new Date() } },
    });
    if (!session) {
      res.status(401).json({ error: 'Unauthorized: session expired or revoked' });
      return;
    }

    req.user = {
      id: payload.sub,
      email: payload.email,
      churchId: payload.churchId || '00000000-0000-0000-0000-000000000000',
      permissions: payload.permissions || [],
      memberId: payload.memberId || null,
      roleIds: payload.roleIds || [],
      ...(payload.preview ? { preview: payload.preview } : {}),
    };
    req.sessionId = session.id;

    // A preview token may only read. Enforced here, once, for every route that authenticates.
    if (payload.preview && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.originalUrl.split('?')[0].endsWith('/access/preview/exit')) {
      res.status(403).json({ error: 'Forbidden: this is a read-only preview. Exit the preview to make changes.' });
      return;
    }

    if (session.deviceId) {
      prisma.device
        .updateMany({
          where: { id: session.deviceId, lastSeenAt: { lt: new Date(Date.now() - DEVICE_TOUCH_INTERVAL_MS) } },
          data: { lastSeenAt: new Date() },
        })
        .catch((error) => logger.warn({ err: error }, 'Failed to update device last-seen'));
    }

    next();
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized: invalid token' });
  }
}
