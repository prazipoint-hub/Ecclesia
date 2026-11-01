import type { AuthorizedUser } from '@/types';
import { ConflictError, NotFoundError, ValidationError } from '@/types/errors';
import { eventEngagementRepository as repository } from '../repository/engagement';
import type { DetectAbsencesInput, UpdateAbsenceInput } from '../types/engagement';
import { audit, require } from './common';

const NEXT: Record<string, string[]> = { OPEN: ['CONTACTED', 'RESOLVED', 'DISMISSED'], CONTACTED: ['RESOLVED', 'DISMISSED'] };
const CLOSING = ['RESOLVED', 'DISMISSED'];

export class AbsenceFollowUpService {
  /**
   * A member is flagged when they were not present (or excused) at any of the last N completed events of a type.
   * Events where nobody was marked present are skipped: attendance was not taken, so absence proves nothing.
   */
  async detect(user: AuthorizedUser, input: DetectAbsencesInput) {
    require(user, 'absence:followup:manage');
    const recent = await repository.recentEventsWithAttendance(user.churchId, input.eventType, new Date(), input.threshold);
    if (recent.length < input.threshold) {
      return { created: 0, candidates: [], eventsConsidered: recent.length, message: `Only ${recent.length} recent ${input.eventType} event(s) have attendance recorded; ${input.threshold} are needed.` };
    }
    // Members who joined after the oldest event could not have attended it.
    const oldest = recent.reduce((min, e) => (e.startDateTime < min ? e.startDateTime : min), recent[0].startDateTime);
    const candidates = await repository.absenceCandidates(user.churchId, recent.map((e) => e.id), oldest);
    if (input.dryRun || candidates.length === 0) return { created: 0, candidates, eventsConsidered: recent.length };

    const result = await repository.createAbsenceFollowUps(
      candidates.map((m) => ({ churchId: user.churchId, memberId: m.id, consecutiveAbsences: input.threshold, eventType: input.eventType }))
    );
    await audit(user, 'ABSENCE_FOLLOWUPS_DETECTED', user.churchId, { eventType: input.eventType, threshold: input.threshold, created: result.count });
    return { created: result.count, candidates, eventsConsidered: recent.length };
  }

  async list(user: AuthorizedUser, query: { status?: string; assignedTo?: string; skip: number; take: number }) {
    require(user, 'absence:followup:manage');
    return repository.listAbsences(
      { churchId: user.churchId, ...(query.status ? { status: query.status } : {}), ...(query.assignedTo ? { assignedTo: query.assignedTo } : {}) },
      query
    );
  }

  async assign(user: AuthorizedUser, id: string, assignedTo: string) {
    require(user, 'absence:followup:manage');
    const followUp = await repository.findAbsence(user.churchId, id);
    if (!followUp) throw new NotFoundError('Absence follow-up');
    if (followUp.status !== 'OPEN' && followUp.status !== 'CONTACTED') throw new ConflictError('A closed follow-up cannot be reassigned');
    const assignee = await repository.findMember(user.churchId, assignedTo);
    if (!assignee || assignee.archivedAt) throw new NotFoundError('Assignee');
    const claimed = await repository.claimAbsence(id, ['OPEN', 'CONTACTED'], { assignedTo });
    if (claimed.count === 0) throw new ConflictError('This follow-up was closed by someone else');
    await audit(user, 'ABSENCE_FOLLOWUP_ASSIGNED', id, { assignedTo });
    return repository.findAbsence(user.churchId, id);
  }

  async update(user: AuthorizedUser, id: string, input: UpdateAbsenceInput) {
    require(user, 'absence:followup:manage');
    const followUp = await repository.findAbsence(user.churchId, id);
    if (!followUp) throw new NotFoundError('Absence follow-up');
    if (!NEXT[followUp.status]?.includes(input.status)) throw new ConflictError(`A ${followUp.status.toLowerCase()} follow-up cannot become ${input.status.toLowerCase()}`);
    const closing = CLOSING.includes(input.status);
    if (closing && !input.notes) throw new ValidationError('Say what happened before closing this follow-up');
    // Closing clears openKey so the member can be flagged again if they stay away later.
    const claimed = await repository.claimAbsence(id, [followUp.status], {
      status: input.status,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(closing ? { openKey: null, closedAt: new Date() } : {}),
    });
    if (claimed.count === 0) throw new ConflictError('This follow-up was changed by someone else. Reload and try again.');
    await audit(user, 'ABSENCE_FOLLOWUP_UPDATED', id, { from: followUp.status, to: input.status });
    return repository.findAbsence(user.churchId, id);
  }
}

export const absenceFollowUpService = new AbsenceFollowUpService();
