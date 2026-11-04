import { logger } from '@/config/logger';
import { prisma } from '@/database';
import type { AuthorizedUser } from '@/types';
import { ForbiddenError, NotFoundError, ValidationError } from '@/types/errors';
import { pastoralCareRepository as repository } from '../repository';

export function require(user: AuthorizedUser, permission: string): void {
  if (!user.permissions.includes(permission)) throw new ForbiddenError(`Forbidden: ${permission} permission required`);
}

/** Pastoral work is attributed to a person, so the account must be linked to a member. */
export function actorOf(user: AuthorizedUser): string {
  if (!user.memberId) throw new ValidationError('A member-linked account is required for pastoral work');
  return user.memberId;
}

export async function memberInChurch(user: AuthorizedUser, memberId: string, label = 'Member') {
  const member = await repository.findMember(user.churchId, memberId);
  if (!member) throw new NotFoundError(label);
  return member;
}

export async function caseInChurch(user: AuthorizedUser, caseId: string) {
  const found = await repository.findCase(user.churchId, caseId);
  if (!found) throw new NotFoundError('Pastoral case');
  return found;
}

export const notInFuture = (date: Date, label: string): void => {
  if (date.getTime() > Date.now()) throw new ValidationError(`${label} cannot be in the future`);
};

/** Audit failures are logged, never allowed to undo the pastoral work already done. */
export async function audit(user: AuthorizedUser, action: string, entityType: string, entityId: string, details: Record<string, unknown> = {}) {
  try {
    await prisma.auditLog.create({
      data: { churchId: user.churchId, action, entityType, entityId, actorId: user.memberId ?? user.id, changes: JSON.stringify(details) },
    });
  } catch (error) {
    logger.error({ err: error, action }, 'Failed to write pastoral audit log');
  }
}

/** Confidential reads must be on record, so unlike other audits this one must succeed before data is released. */
export async function auditStrict(user: AuthorizedUser, action: string, entityType: string, entityId: string, details: Record<string, unknown> = {}) {
  await prisma.auditLog.create({
    data: { churchId: user.churchId, action, entityType, entityId, actorId: user.memberId ?? user.id, changes: JSON.stringify(details) },
  });
}
