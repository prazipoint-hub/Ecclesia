import { logger } from '@/config/logger';
import { settingsReader } from '@/features/admin/service/settings';
import { prisma } from '@/database';
import type { AuthorizedUser } from '@/types';
import { ForbiddenError, NotFoundError, ValidationError } from '@/types/errors';
import { eventEngagementRepository as repository } from '../repository/engagement';

export function require(user: AuthorizedUser, permission: string): void {
  if (!user.permissions.includes(permission)) throw new ForbiddenError(`Forbidden: ${permission} permission required`);
}

export function memberOf(user: AuthorizedUser): string {
  if (!user.memberId) throw new ValidationError('A member-linked account is required');
  return user.memberId;
}

export async function eventInChurch(user: AuthorizedUser, eventId: string) {
  const event = await repository.findEvent(user.churchId, eventId);
  if (!event) throw new NotFoundError('Event');
  return event;
}

const HOUR = 60 * 60 * 1000;
/** Events without an end time are treated as lasting six hours. */
export const eventEnd = (event: { startDateTime: Date; endDateTime: Date | null }): Date =>
  event.endDateTime ?? new Date(event.startDateTime.getTime() + 6 * HOUR);

/** Check-in opens and closes around the event; the margins are church settings (two hours each by default). */
export const checkInWindow = async (churchId: string, event: { startDateTime: Date; endDateTime: Date | null }) => {
  const [before, after] = await Promise.all([
    settingsReader.get(churchId, 'events.checkInOpensHoursBefore'),
    settingsReader.get(churchId, 'events.checkInClosesHoursAfter'),
  ]);
  return {
    opens: new Date(event.startDateTime.getTime() - before * HOUR),
    closes: new Date(eventEnd(event).getTime() + after * HOUR),
  };
};

export async function audit(user: AuthorizedUser, action: string, entityId: string, details: Record<string, unknown> = {}) {
  try {
    await prisma.auditLog.create({
      data: { churchId: user.churchId, action, entityType: 'EVENT', entityId, actorId: user.memberId ?? user.id, changes: JSON.stringify(details) },
    });
  } catch (error) {
    logger.error({ err: error, action }, 'Failed to write event audit log');
  }
}
