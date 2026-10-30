import { NotFoundError, ValidationError } from '@/types/errors';
import type { AuthorizedUser } from '@/types';
import { pastoralCareRepository as repository } from '../repository';
import type { CreateVisitInput, UpdateVisitInput } from '../types';
import { actorOf, audit, caseInChurch, memberInChurch, require } from './common';

export class PastoralVisitService {
  async list(user: AuthorizedUser, query: { memberId?: string; caseId?: string; skip: number; take: number }) {
    require(user, 'pastoral:visit:view');
    const where = { churchId: user.churchId, ...(query.memberId ? { memberId: query.memberId } : {}), ...(query.caseId ? { caseId: query.caseId } : {}) };
    return repository.listVisits(where, query);
  }

  async get(user: AuthorizedUser, id: string) {
    require(user, 'pastoral:visit:view');
    const visit = await repository.findVisit(user.churchId, id);
    if (!visit) throw new NotFoundError('Visit');
    return visit;
  }

  async create(user: AuthorizedUser, input: CreateVisitInput) {
    require(user, 'pastoral:visit:create');
    const actor = actorOf(user);
    await memberInChurch(user, input.memberId);
    if (input.caseId) {
      const pastoralCase = await caseInChurch(user, input.caseId);
      if (pastoralCase.memberId !== input.memberId) throw new ValidationError('That case belongs to a different member');
    }
    if (input.followUpRequired && !input.followUpDate) throw new ValidationError('Set a follow-up date when a follow-up is required');
    const { followUpRequired, followUpDate, ...rest } = input;
    const visit = await repository.createVisit({
      ...rest,
      churchId: user.churchId,
      visitedBy: actor,
      followUpRequired,
      followUpDate: followUpRequired ? followUpDate : null,
    });
    await audit(user, 'PASTORAL_VISIT_RECORDED', 'PASTORAL_VISIT', visit.id, { memberId: visit.memberId, visitType: visit.visitType, outcome: visit.outcome });
    return visit;
  }

  async update(user: AuthorizedUser, id: string, input: UpdateVisitInput) {
    require(user, 'pastoral:visit:update');
    actorOf(user);
    const visit = await repository.findVisit(user.churchId, id);
    if (!visit) throw new NotFoundError('Visit');
    const followUpRequired = input.followUpRequired ?? visit.followUpRequired;
    const followUpDate = input.followUpDate === undefined ? visit.followUpDate : input.followUpDate;
    if (followUpRequired && !followUpDate) throw new ValidationError('Set a follow-up date when a follow-up is required');
    const updated = await repository.updateVisit(id, {
      ...(input.outcome ? { outcome: input.outcome } : {}),
      ...(input.observations ? { observations: input.observations } : {}),
      followUpRequired,
      followUpDate: followUpRequired ? followUpDate : null,
    });
    await audit(user, 'PASTORAL_VISIT_UPDATED', 'PASTORAL_VISIT', id, { outcome: input.outcome, followUpRequired });
    return updated;
  }
}

export const pastoralVisitService = new PastoralVisitService();
