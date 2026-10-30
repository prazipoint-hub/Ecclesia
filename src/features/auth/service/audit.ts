import { prisma } from '@/database';
import { logger } from '@/config/logger';

export async function auditAuthEvent(params: {
  churchId: string | null | undefined;
  action: string;
  entityType: string;
  entityId: string;
  actorId: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  // AuditLog is tenant-scoped; accounts without a church cannot be audited here.
  if (!params.churchId) return;
  try {
    await prisma.auditLog.create({
      data: {
        churchId: params.churchId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        actorId: params.actorId,
        newState: params.detail ? JSON.stringify(params.detail) : null,
      },
    });
  } catch (error) {
    logger.error({ err: error, action: params.action }, 'Failed to write auth audit log');
  }
}
