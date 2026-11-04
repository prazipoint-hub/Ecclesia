import type { AuthorizedUser } from '@/types';
import { ValidationError } from '@/types/errors';
import { eventEngagementRepository as repository } from '../repository/engagement';
import type { AnalyticsQuery } from '../types/engagement';
import { require } from './common';

const DAY = 24 * 60 * 60 * 1000;
const round = (n: number) => Math.round(n * 10) / 10;

export class AttendanceAnalyticsService {
  async attendance(user: AuthorizedUser, query: AnalyticsQuery) {
    require(user, 'attendance:analytics:view');
    const to = query.to ?? new Date();
    const from = query.from ?? new Date(to.getTime() - 90 * DAY);
    if (from > to) throw new ValidationError('The start date must be before the end date');
    if (to.getTime() - from.getTime() > 366 * DAY) throw new ValidationError('Choose a period of a year or less');

    // Only events that have started: a future event has no attendance to measure.
    const events = await repository.eventsForAnalytics({
      churchId: user.churchId,
      status: { in: ['ONGOING', 'COMPLETED'] },
      startDateTime: { gte: from, lte: to },
      ...(query.eventType ? { eventType: query.eventType } : {}),
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
    });

    const rows = events.map((e) => ({
      id: e.id, title: e.title, eventType: e.eventType, startDateTime: e.startDateTime,
      present: e._count.attendances, registered: e._count.registrations, expected: e.expectedAttendance,
      attendanceRate: e.expectedAttendance ? round((e._count.attendances / e.expectedAttendance) * 100) : null,
    }));

    const group = <K extends string>(keyOf: (r: (typeof rows)[number]) => K) => {
      const map = new Map<K, { events: number; present: number }>();
      for (const r of rows) {
        const k = keyOf(r);
        const cur = map.get(k) ?? { events: 0, present: 0 };
        map.set(k, { events: cur.events + 1, present: cur.present + r.present });
      }
      return [...map.entries()].map(([key, v]) => ({ key, events: v.events, present: v.present, average: round(v.present / v.events) }));
    };

    const ids = rows.map((r) => r.id);
    const [methods, attendees] = ids.length ? await Promise.all([repository.checkInMethods(ids), repository.distinctAttendees(ids)]) : [[], []];
    const totalPresent = rows.reduce((sum, r) => sum + r.present, 0);

    return {
      period: { from, to },
      totalEvents: rows.length,
      totalPresent,
      averagePerEvent: rows.length ? round(totalPresent / rows.length) : 0,
      uniqueAttendees: attendees.length,
      byType: group((r) => r.eventType).map(({ key, ...rest }) => ({ eventType: key, ...rest })).sort((a, b) => b.present - a.present),
      byMonth: group((r) => r.startDateTime.toISOString().slice(0, 7)).map(({ key, ...rest }) => ({ month: key, ...rest })).sort((a, b) => a.month.localeCompare(b.month)),
      checkInMethods: Object.fromEntries(methods.map((m) => [m.method, m._count._all])),
      events: rows,
      truncated: rows.length === 500,
    };
  }
}

export const attendanceAnalyticsService = new AttendanceAnalyticsService();
