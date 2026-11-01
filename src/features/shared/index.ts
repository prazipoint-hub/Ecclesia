import { Response } from 'express';
import { logger } from '@/config/logger';
import { prisma } from '@/database';
import type { AuthRequest, AuthorizedUser } from '@/types';
import { ForbiddenError } from '@/types/errors';
import { handleError } from '@/utils/errorHandler';

export function require(user: AuthorizedUser, permission: string): void {
  if (!user.permissions.includes(permission)) throw new ForbiddenError(`Forbidden: ${permission} permission required`);
}

export async function audit(user: AuthorizedUser, action: string, entityType: string, entityId: string, details: Record<string, unknown> = {}) {
  try {
    await prisma.auditLog.create({
      data: { churchId: user.churchId, action, entityType, entityId, actorId: user.memberId ?? user.id, changes: JSON.stringify(details) },
    });
  } catch (error) {
    logger.error({ err: error, action }, 'Failed to write audit log');
  }
}

type Handler = (req: AuthRequest, res: Response) => Promise<void>;
export const guarded = (handler: Handler): Handler => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    handleError(error, res);
  }
};
