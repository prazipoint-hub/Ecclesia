import { createHash, randomBytes } from 'crypto';
import { audit } from '@/features/shared';
import type { AuthorizedUser } from '@/types';
import { ConflictError, NotFoundError } from '@/types/errors';
import { calendarRepository as repository } from '../repository';
import { buildIcs } from './ical';

const MAX_ACTIVE_FEEDS = 5;
const DAY = 24 * 60 * 60 * 1000;
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export class CalendarService {
  /** The secret is returned once and only its hash is kept, so a database leak does not expose working links. */
  async createFeed(user: AuthorizedUser, label?: string) {
    if ((await repository.countActive(user.id)) >= MAX_ACTIVE_FEEDS) throw new ConflictError(`You can have at most ${MAX_ACTIVE_FEEDS} active calendar links. Revoke one first.`);
    const token = randomBytes(32).toString('base64url');
    const feed = await repository.create({ churchId: user.churchId, userId: user.id, tokenHash: hash(token), label: label ?? null });
    await audit(user, 'CALENDAR_FEED_CREATED', 'CALENDAR_FEED', feed.id);
    return { id: feed.id, label: feed.label, path: `/api/v2/public/calendar/${token}.ics`, token };
  }

  listFeeds(user: AuthorizedUser) {
    return repository.listForUser(user.id);
  }

  async revokeFeed(user: AuthorizedUser, id: string) {
    const result = await repository.revoke(id, user.id, new Date());
    if (result.count === 0) throw new NotFoundError('Calendar link');
    await audit(user, 'CALENDAR_FEED_REVOKED', 'CALENDAR_FEED', id);
    return { revoked: true };
  }

  /** Unauthenticated: possession of the secret is the credential. Revoked links and switched-off accounts get the same 404 as an unknown one. */
  async render(token: string, now = new Date()): Promise<string> {
    const feed = await repository.findByHash(hash(token));
    if (!feed || feed.revokedAt || feed.user.disabledAt) throw new NotFoundError('Calendar');
    await repository.touch(feed.id, now).catch(() => undefined);
    const events = await repository.events(feed.churchId, new Date(now.getTime() - 30 * DAY), new Date(now.getTime() + 365 * DAY));
    return buildIcs(feed.church.name, events, now);
  }
}

export const calendarService = new CalendarService();
