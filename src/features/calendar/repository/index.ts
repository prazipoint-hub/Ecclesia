import { prisma } from '@/database';

export class CalendarRepository {
  countActive(userId: string) {
    return prisma.calendarFeed.count({ where: { userId, revokedAt: null } });
  }
  create(data: { churchId: string; userId: string; tokenHash: string; label: string | null }) {
    return prisma.calendarFeed.create({ data });
  }
  listForUser(userId: string) {
    return prisma.calendarFeed.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { id: true, label: true, createdAt: true, lastUsedAt: true, revokedAt: true } });
  }
  /** Revokes only the caller's own, still-active feed. */
  revoke(id: string, userId: string, now: Date) {
    return prisma.calendarFeed.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: now } });
  }
  findByHash(tokenHash: string) {
    return prisma.calendarFeed.findUnique({ where: { tokenHash }, include: { user: { select: { disabledAt: true } }, church: { select: { name: true } } } });
  }
  touch(id: string, now: Date) {
    return prisma.calendarFeed.update({ where: { id }, data: { lastUsedAt: now } });
  }
  events(churchId: string, from: Date, to: Date) {
    return prisma.event.findMany({
      where: { churchId, status: { not: 'CANCELLED' }, startDateTime: { gte: from, lte: to } },
      orderBy: { startDateTime: 'asc' },
      take: 500,
      select: { id: true, title: true, description: true, location: true, startDateTime: true, endDateTime: true, updatedAt: true },
    });
  }
}

export const calendarRepository = new CalendarRepository();
