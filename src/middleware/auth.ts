import { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest, AuthorizedUser } from '@/types';

const JWT_SECRET = process.env.JWT_SECRET || 'ecclesia-dev-secret';

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
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
    };

    req.user = {
      id: payload.sub || payload.id || 'system-user',
      email: payload.email,
      churchId: payload.churchId || '00000000-0000-0000-0000-000000000000',
      permissions: payload.permissions || [],
      memberId: payload.memberId || null,
      roleIds: payload.roleIds || [],
    };

    next();
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized: invalid token' });
  }
}
