import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/types/errors';
import type { AuthorizedUser } from '@/types';
import { pastoralCareRepository as repository } from '../repository';
import type { SubmitPrayerInput, UpdatePrayerInput } from '../types';
import { actorOf, audit, auditStrict, require } from './common';

const L4 = 'pastoral:l4:access';
const REDACTED = '[Confidential - open the request with a justification to read it]';

type Prayer = NonNullable<Awaited<ReturnType<typeof repository.findPrayer>>>;

/** Confidential text is hidden in every list, even from people who may open it individually. */
const forList = (p: Prayer) => (p.visibility === 'CONFIDENTIAL' ? { ...p, request: REDACTED } : p);

export class PrayerService {
  /** Any signed-in member may ask for prayer for themselves. */
  async submit(user: AuthorizedUser, input: SubmitPrayerInput) {
    const memberId = actorOf(user);
    return repository.createPrayer({ churchId: user.churchId, memberId, request: input.request, visibility: input.visibility });
  }

  async mine(user: AuthorizedUser, query: { skip: number; take: number }) {
    const memberId = actorOf(user);
    return repository.listPrayer({ churchId: user.churchId, memberId }, query);
  }

  /** The public wall shows only what the member chose to share church-wide, and only a first name. */
  async wall(user: AuthorizedUser, query: { skip: number; take: number }) {
    const { items, total } = await repository.listPrayer({ churchId: user.churchId, visibility: 'CHURCH_WIDE', status: { not: 'CLOSED' } }, query);
    return {
      items: items.map((p) => ({ id: p.id, request: p.request, submitted: p.submitted, firstName: p.member.firstName })),
      total,
    };
  }

  async list(user: AuthorizedUser, query: { status?: string; memberId?: string; skip: number; take: number }) {
    require(user, 'pastoral:prayer:view');
    const visibility = user.permissions.includes(L4) ? undefined : { not: 'CONFIDENTIAL' };
    const where = {
      churchId: user.churchId,
      ...(visibility ? { visibility } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.memberId ? { memberId: query.memberId } : {}),
    };
    const { items, total } = await repository.listPrayer(where, query);
    return { items: items.map(forList), total };
  }

  async get(user: AuthorizedUser, id: string, justification?: string) {
    const prayer = await repository.findPrayer(user.churchId, id);
    if (!prayer) throw new NotFoundError('Prayer request');
    const owner = prayer.memberId === user.memberId;
    if (owner) return prayer;
    require(user, 'pastoral:prayer:view');
    if (prayer.visibility !== 'CONFIDENTIAL') return prayer;
    if (!user.permissions.includes(L4)) throw new NotFoundError('Prayer request'); // do not reveal that it exists
    if (!justification) throw new ValidationError('A justification of at least 10 characters is required to read a confidential request');
    await auditStrict(user, 'CONFIDENTIAL_PRAYER_VIEWED', 'PRAYER_REQUEST', id, { memberId: prayer.memberId, justification });
    return prayer;
  }

  async updateStatus(user: AuthorizedUser, id: string, input: UpdatePrayerInput) {
    require(user, 'pastoral:prayer:manage');
    actorOf(user);
    const prayer = await repository.findPrayer(user.churchId, id);
    if (!prayer) throw new NotFoundError('Prayer request');
    if (prayer.visibility === 'CONFIDENTIAL' && !user.permissions.includes(L4)) throw new ForbiddenError(`Forbidden: ${L4} permission required`);
    if (prayer.status === 'CLOSED') throw new ConflictError('This prayer request is already closed');
    if (input.status === 'CLOSED' && !input.closedReason) throw new ValidationError('Say why the request is being closed');
    if (input.status === prayer.status) return prayer;
    const claimed = await repository.claimPrayer(id, prayer.status, {
      status: input.status,
      closedReason: input.status === 'CLOSED' ? input.closedReason : null,
    });
    if (claimed.count === 0) throw new ConflictError('This prayer request was changed by someone else. Reload and try again.');
    await audit(user, 'PRAYER_REQUEST_STATUS_CHANGED', 'PRAYER_REQUEST', id, { from: prayer.status, to: input.status });
    return repository.findPrayer(user.churchId, id);
  }
}

export const prayerService = new PrayerService();
