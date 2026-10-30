import { ConflictError, NotFoundError, ValidationError } from '@/types/errors';
import type { AuthorizedUser } from '@/types';
import { pastoralCareRepository as repository } from '../repository';
import type { CreateFollowUpInput } from '../types';
import { actorOf, audit, caseInChurch, require } from './common';

type FollowUp = NonNullable<Awaited<ReturnType<typeof repository.findFollowUp>>>;

const startOfToday = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

/** Overdue is computed from the due date, so it is right even if no job has run. */
const withEffectiveStatus = <T extends FollowUp>(f: T) => ({
  ...f,
  effectiveStatus: f.status === 'PENDING' && f.dueDate.getTime() < Date.now() ? 'OVERDUE' : f.status,
});

export class FollowUpService {
  async list(user: AuthorizedUser, query: { status?: string; caseId?: string; memberId?: string; skip: number; take: number }) {
    require(user, 'pastoral:followup:view');
    const now = new Date();
    const open = { in: ['PENDING', 'OVERDUE'] };
    const statusFilter =
      query.status === 'OVERDUE' ? { status: open, dueDate: { lt: now } }
      : query.status === 'PENDING' ? { status: open, dueDate: { gte: now } }
      : query.status ? { status: query.status }
      : {};
    const where = {
      churchId: user.churchId,
      ...statusFilter,
      ...(query.caseId ? { caseId: query.caseId } : {}),
      ...(query.memberId ? { memberId: query.memberId } : {}),
    };
    const { items, total } = await repository.listFollowUps(where, query);
    return { items: items.map(withEffectiveStatus), total };
  }

  async create(user: AuthorizedUser, input: CreateFollowUpInput) {
    require(user, 'pastoral:followup:manage');
    actorOf(user);
    const pastoralCase = await caseInChurch(user, input.caseId);
    if (pastoralCase.status === 'CLOSED') throw new ConflictError('A closed pastoral case cannot get a follow-up');
    if (input.dueDate.getTime() < startOfToday().getTime()) throw new ValidationError('The due date cannot be in the past');
    const followUp = await repository.createFollowUp({
      churchId: user.churchId,
      memberId: pastoralCase.memberId,
      caseId: pastoralCase.id,
      dueDate: input.dueDate,
      reason: input.reason,
      notes: input.notes ?? null,
    });
    await audit(user, 'PASTORAL_FOLLOWUP_CREATED', 'PASTORAL_FOLLOWUP', followUp.id, { caseId: followUp.caseId, dueDate: followUp.dueDate });
    return withEffectiveStatus(followUp);
  }

  complete(user: AuthorizedUser, id: string, notes?: string) {
    return this.finish(user, id, 'COMPLETED', notes);
  }

  cancel(user: AuthorizedUser, id: string, notes?: string) {
    return this.finish(user, id, 'CANCELLED', notes);
  }

  private async finish(user: AuthorizedUser, id: string, status: 'COMPLETED' | 'CANCELLED', notes?: string) {
    require(user, 'pastoral:followup:manage');
    actorOf(user);
    const followUp = await repository.findFollowUp(user.churchId, id);
    if (!followUp) throw new NotFoundError('Follow-up');
    const claimed = await repository.closeFollowUp(id, {
      status,
      ...(status === 'COMPLETED' ? { completedAt: new Date() } : {}),
      ...(notes !== undefined ? { notes } : {}),
    });
    if (claimed.count === 0) throw new ConflictError('This follow-up has already been completed or cancelled');
    await audit(user, status === 'COMPLETED' ? 'PASTORAL_FOLLOWUP_COMPLETED' : 'PASTORAL_FOLLOWUP_CANCELLED', 'PASTORAL_FOLLOWUP', id, { caseId: followUp.caseId });
    return withEffectiveStatus((await repository.findFollowUp(user.churchId, id))!);
  }
}

export const followUpService = new FollowUpService();
