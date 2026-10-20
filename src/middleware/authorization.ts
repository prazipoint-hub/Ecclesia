import { NextFunction, Response } from 'express';
import { AuthRequest } from '@/types';

export function authorize(permission: string) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
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
}
