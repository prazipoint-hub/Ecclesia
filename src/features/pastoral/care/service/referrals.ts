import { ConflictError, NotFoundError, ValidationError } from '@/types/errors';
import type { AuthorizedUser } from '@/types';
import { pastoralCareRepository as repository } from '../repository';
import type { CreateReferralInput, UpdateReferralInput } from '../types';
import { actorOf, audit, caseInChurch, require } from './common';

const NEXT: Record<string, string[]> = {
  PENDING: ['ACCEPTED', 'DECLINED', 'AWAITING_RESPONSE'],
  AWAITING_RESPONSE: ['ACCEPTED', 'DECLINED'],
  ACCEPTED: ['IN_PROGRESS', 'COMPLETED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  DECLINED: [],
};

export class ReferralService {
  async list(user: AuthorizedUser, query: { status?: string; caseId?: string; memberId?: string; skip: number; take: number }) {
    require(user, 'pastoral:referral:view');
    const where = {
      churchId: user.churchId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.caseId ? { caseId: query.caseId } : {}),
      ...(query.memberId ? { memberId: query.memberId } : {}),
    };
    return repository.listReferrals(where, query);
  }

  async get(user: AuthorizedUser, id: string) {
    require(user, 'pastoral:referral:view');
    const referral = await repository.findReferral(user.churchId, id);
    if (!referral) throw new NotFoundError('Referral');
    return referral;
  }

  async create(user: AuthorizedUser, input: CreateReferralInput) {
    require(user, 'pastoral:referral:create');
    const actor = actorOf(user);
    const pastoralCase = await caseInChurch(user, input.caseId);
    if (pastoralCase.status === 'CLOSED') throw new ConflictError('A closed pastoral case cannot receive a referral');
    const referral = await repository.createReferral({
      churchId: user.churchId,
      memberId: pastoralCase.memberId,
      caseId: pastoralCase.id,
      referralType: input.referralType,
      referredBy: actor,
      providerName: input.providerName,
      reason: input.reason,
      followUpDate: input.followUpDate ?? null,
      notes: input.notes ?? null,
    });
    await audit(user, 'PASTORAL_REFERRAL_CREATED', 'PASTORAL_REFERRAL', referral.id, { caseId: referral.caseId, referralType: referral.referralType });
    return referral;
  }

  async update(user: AuthorizedUser, id: string, input: UpdateReferralInput) {
    require(user, 'pastoral:referral:update');
    actorOf(user);
    const referral = await repository.findReferral(user.churchId, id);
    if (!referral) throw new NotFoundError('Referral');
    if (NEXT[referral.status]?.length === 0) throw new ConflictError(`A ${referral.status.toLowerCase()} referral can no longer be changed`);

    const status = input.status ?? referral.status;
    if (status !== referral.status && !NEXT[referral.status]?.includes(status)) {
      throw new ConflictError(`A referral cannot move from ${referral.status} to ${status}`);
    }
    const outcome = input.outcome ?? referral.outcome;
    if (status === 'COMPLETED' && !outcome) throw new ValidationError('Record the outcome before completing a referral');

    const claimed = await repository.claimReferral(id, referral.status, {
      status,
      ...(input.outcome !== undefined ? { outcome: input.outcome } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.followUpDate !== undefined ? { followUpDate: input.followUpDate } : {}),
    });
    if (claimed.count === 0) throw new ConflictError('This referral was changed by someone else. Reload and try again.');
    await audit(user, 'PASTORAL_REFERRAL_UPDATED', 'PASTORAL_REFERRAL', id, { from: referral.status, to: status });
    return repository.findReferral(user.churchId, id);
  }
}

export const referralService = new ReferralService();
