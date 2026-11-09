import { NextFunction, Response } from 'express';
import { AuthRequest } from '@/types';

import { activeGrants } from '@/features/access/service/scope';
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

/**
 * For routes whose service does the precise scope check (`assertAt`): lets through a token permission OR a user holding
 * the permission through any active scoped grant. The service then decides whether it applies to THIS record.
 */
export function authorizeOrScoped(permission: string): PermissionGuard {
  const guard = (req: AuthRequest, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) { res.status(401).json({ error: 'Unauthorized: authentication required' }); return; }
    if (user.permissions?.includes(permission)) { next(); return; }
    activeGrants(user.id)
      .then((grants) => {
        if (grants.some((g) => g.role.permissions.some((p) => p.permission.name === permission))) next();
        else res.status(403).json({ error: `Forbidden: ${permission} permission required` });
      })
      .catch(() => res.status(500).json({ error: 'Could not check permissions' }));
  };
  return Object.assign(guard, { requiredPermission: permission });
}
