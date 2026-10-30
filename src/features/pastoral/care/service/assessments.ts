import type { AuthorizedUser } from '@/types';
import { pastoralCareRepository as repository } from '../repository';
import type { CreateAssessmentInput } from '../types';
import { actorOf, audit, memberInChurch, require } from './common';

export class AssessmentService {
  async list(user: AuthorizedUser, query: { memberId: string; skip: number; take: number }) {
    require(user, 'pastoral:assessment:view');
    await memberInChurch(user, query.memberId);
    await audit(user, 'PASTORAL_ASSESSMENTS_VIEWED', 'PASTORAL_ASSESSMENT', query.memberId);
    return repository.listAssessments({ churchId: user.churchId, memberId: query.memberId }, query);
  }

  /** Assessments are never edited: each one is a dated snapshot so change over time stays visible. */
  async create(user: AuthorizedUser, input: CreateAssessmentInput) {
    require(user, 'pastoral:assessment:update');
    const assessedBy = actorOf(user);
    await memberInChurch(user, input.memberId);
    const assessment = await repository.createAssessment({ ...input, churchId: user.churchId, assessedBy });
    await audit(user, 'PASTORAL_ASSESSMENT_RECORDED', 'PASTORAL_ASSESSMENT', assessment.id, { memberId: input.memberId });
    return assessment;
  }
}

export const assessmentService = new AssessmentService();
