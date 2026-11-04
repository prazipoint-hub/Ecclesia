import { logger } from '@/config/logger';
import { prisma } from '@/database';
import type { AuthorizedUser } from '@/types';
import { ForbiddenError } from '@/types/errors';

export function require(user: AuthorizedUser, permission: string): void {
  if (!user.permissions.includes(permission)) throw new ForbiddenError(`Forbidden: ${permission} permission required`);
}

export async function audit(user: AuthorizedUser, action: string, entityType: string, entityId: string, details: Record<string, unknown> = {}) {
  try {
    await prisma.auditLog.create({
      data: { churchId: user.churchId, action, entityType, entityId, actorId: user.memberId ?? user.id, changes: JSON.stringify(details) },
    });
  } catch (error) {
    logger.error({ err: error, action }, 'Failed to write admin audit log');
  }
}
