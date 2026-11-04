import { ForbiddenError, NotFoundError, ValidationError } from '@/types/errors';
import type { AuthorizedUser } from '@/types';
import { pastoralCareRepository as repository } from '../repository';
import type { CreateCounselingInput, UpdateCounselingInput } from '../types';
import { actorOf, audit, auditStrict, caseInChurch, memberInChurch, require } from './common';

const CONFIDENTIAL = 'pastoral:counseling:confidential';

type Session = NonNullable<Awaited<ReturnType<typeof repository.findCounseling>>>;

/** Confidential fields never leave in a list; they are only released on a single, audited read. */
export const redact = <T extends Session>(session: T) => {
  const { confidentialNotes, followUpPlan, ...rest } = session;
  return { ...rest, hasConfidentialContent: Boolean(confidentialNotes || followUpPlan) };
};

export class CounselingService {
  async list(user: AuthorizedUser, query: { memberId?: string; caseId?: string; skip: number; take: number }) {
    require(user, 'pastoral:counseling:view');
    const where = { churchId: user.churchId, ...(query.memberId ? { memberId: query.memberId } : {}), ...(query.caseId ? { caseId: query.caseId } : {}) };
    const { items, total } = await repository.listCounseling(where, query);
    return { items: items.map(redact), total };
  }

  async get(user: AuthorizedUser, id: string) {
    require(user, 'pastoral:counseling:view');
    const session = await repository.findCounseling(user.churchId, id);
    if (!session) throw new NotFoundError('Counseling session');
    if (!user.permissions.includes(CONFIDENTIAL)) return redact(session);
    if (session.confidentialNotes || session.followUpPlan) {
      await auditStrict(user, 'COUNSELING_CONFIDENTIAL_VIEWED', 'COUNSELING', id, { memberId: session.memberId });
      return { ...redact(session), confidentialNotes: session.confidentialNotes, followUpPlan: session.followUpPlan };
    }
    return redact(session);
  }

  async create(user: AuthorizedUser, input: CreateCounselingInput) {
    require(user, 'pastoral:counseling:create');
    const counselor = actorOf(user);
    if ((input.confidentialNotes || input.followUpPlan) && !user.permissions.includes(CONFIDENTIAL)) {
      throw new ForbiddenError(`Forbidden: ${CONFIDENTIAL} permission required`);
    }
    await memberInChurch(user, input.memberId);
    if (input.caseId) {
      const pastoralCase = await caseInChurch(user, input.caseId);
      if (pastoralCase.memberId !== input.memberId) throw new ValidationError('That case belongs to a different member');
    }
    const session = await repository.createCounseling({ ...input, churchId: user.churchId, counselorId: counselor });
    await audit(user, 'COUNSELING_SESSION_RECORDED', 'COUNSELING', session.id, {
      memberId: session.memberId, counselingType: session.counselingType, hasConfidentialContent: Boolean(input.confidentialNotes || input.followUpPlan),
    });
    return redact(session);
  }

  async update(user: AuthorizedUser, id: string, input: UpdateCounselingInput) {
    require(user, 'pastoral:counseling:update');
    actorOf(user);
    const touchesConfidential = input.confidentialNotes !== undefined || input.followUpPlan !== undefined;
    if (touchesConfidential && !user.permissions.includes(CONFIDENTIAL)) throw new ForbiddenError(`Forbidden: ${CONFIDENTIAL} permission required`);
    const existing = await repository.findCounseling(user.churchId, id);
    if (!existing) throw new NotFoundError('Counseling session');
    const updated = await repository.updateCounseling(id, input);
    await audit(user, 'COUNSELING_SESSION_UPDATED', 'COUNSELING', id, { outcome: input.outcome, touchedConfidential: touchesConfidential });
    return redact(updated);
  }
}

export const counselingService = new CounselingService();
