import { NextFunction, Response } from 'express';
import { AuthRequest } from '@/types';

/** The returned middleware carries its permission so the API reference can list what each route needs. */
export type PermissionGuard = ((req: AuthRequest, res: Response, next: NextFunction) => void) & { requiredPermission: string };

export function authorize(permission: string): PermissionGuard {
  const guard = (req: AuthRequest, res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      res.status(401).json({ error: 'Unauthorized: authentication required' });
      return;
    }

    if (!user.permissions?.includes(permission)) {
      res.status(403).json({ error: `Forbidden: ${permission} permission required` });
      return;
    }

    next();
  };
  return Object.assign(guard, { requiredPermission: permission });
}
