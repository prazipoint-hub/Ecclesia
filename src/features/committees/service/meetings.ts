import { logger } from '@/config/logger';
import { prisma } from '@/database';
import type { AuthorizedUser } from '@/types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/types/errors';
import { meetingRepository as repository } from '../repository/meetings';
import type { CreateMeetingInput, DecisionInput, MeetingListQuery, UpdateDecisionInput, UpdateMeetingInput } from '../types/meetings';

type MeetingRow = NonNullable<Awaited<ReturnType<typeof repository.findMeeting>>>;

function require(user: AuthorizedUser, permission: string): void {
  if (!user.permissions.includes(permission)) throw new ForbiddenError(`Forbidden: ${permission} permission required`);
}

/** A decision's recorded outcome has to agree with its vote, otherwise the minutes contradict themselves. */
function assertVoteMatchesOutcome(status: string, votesFor: number, votesAgainst: number): void {
  if (votesFor + votesAgainst === 0) return;
  if (status === 'APPROVED' && votesFor <= votesAgainst) throw new ValidationError('A decision cannot be approved without more votes for than against');
  if (status === 'REJECTED' && votesAgainst < votesFor) throw new ValidationError('A decision cannot be rejected when more members voted for it');
}

export class MeetingService {
  async create(user: AuthorizedUser, committeeId: string, input: CreateMeetingInput) {
    require(user, 'committee:meeting:create');
    const committee = await repository.findCommittee(user.churchId, committeeId);
    if (!committee) throw new NotFoundError('Committee');
    const meeting = await repository.createMeeting({
      churchId: user.churchId, committeeId, title: input.title, scheduledAt: input.scheduledAt,
      location: input.location ?? null, agenda: input.agenda ?? null, createdBy: user.id,
    });
    await this.audit(user, 'COMMITTEE_MEETING_CREATED', meeting.id, { committeeId });
    return this.get(user, meeting.id);
  }

  async list(user: AuthorizedUser, committeeId: string, query: MeetingListQuery) {
    require(user, 'committee:view');
    if (!(await repository.findCommittee(user.churchId, committeeId))) throw new NotFoundError('Committee');
    const [rows, total] = await repository.listMeetings(
      { churchId: user.churchId, committeeId, ...(query.status ? { status: query.status } : {}) },
      (query.page - 1) * query.pageSize,
      query.pageSize
    );
    return {
      items: rows.map((m) => ({
        id: m.id, title: m.title, scheduledAt: m.scheduledAt, location: m.location, status: m.status,
        minutesLocked: m.minutesLockedAt !== null, decisionCount: m._count.decisions,
      })),
      total, page: query.page, pageSize: query.pageSize,
    };
  }

  async get(user: AuthorizedUser, meetingId: string) {
    require(user, 'committee:view');
    return this.view(await this.owned(user, meetingId));
  }

  async update(user: AuthorizedUser, meetingId: string, input: UpdateMeetingInput) {
    require(user, 'committee:meeting:manage');
    const meeting = await this.owned(user, meetingId);
    if (meeting.status === 'CANCELLED') throw new ConflictError('A cancelled meeting cannot be edited');
    if (input.minutes !== undefined && meeting.status === 'SCHEDULED') throw new ConflictError('Minutes can only be recorded after the meeting has been held');
    if (!(await repository.updateIfUnlocked(meetingId, input))) throw new ConflictError('The minutes are locked and can no longer be changed');
    return this.get(user, meetingId);
  }

  async markHeld(user: AuthorizedUser, meetingId: string) {
    require(user, 'committee:meeting:manage');
    const meeting = await this.owned(user, meetingId);
    if (meeting.status !== 'SCHEDULED') throw new ConflictError(`Meeting is already ${meeting.status.toLowerCase()}`);
    await repository.updateMeeting(meetingId, { status: 'HELD' });
    return this.get(user, meetingId);
  }

  async cancel(user: AuthorizedUser, meetingId: string) {
    require(user, 'committee:meeting:manage');
    const meeting = await this.owned(user, meetingId);
    if (meeting.status !== 'SCHEDULED') throw new ConflictError(`Only scheduled meetings can be cancelled; this one is ${meeting.status.toLowerCase()}`);
    await repository.updateMeeting(meetingId, { status: 'CANCELLED' });
    await this.audit(user, 'COMMITTEE_MEETING_CANCELLED', meetingId, {});
    return this.get(user, meetingId);
  }

  /** Locking turns the minutes and decisions into the permanent record. */
  async lockMinutes(user: AuthorizedUser, meetingId: string) {
    require(user, 'committee:meeting:manage');
    const meeting = await this.owned(user, meetingId);
    if (meeting.status !== 'HELD') throw new ConflictError('Only a meeting that has been held can have its minutes locked');
    if (!meeting.minutes?.trim()) throw new ValidationError('Record the minutes before locking them');
    if (!(await repository.updateIfUnlocked(meetingId, { minutesLockedAt: new Date() }))) throw new ConflictError('The minutes are already locked');
    await this.audit(user, 'COMMITTEE_MINUTES_LOCKED', meetingId, {});
    return this.get(user, meetingId);
  }

  async addDecision(user: AuthorizedUser, meetingId: string, input: DecisionInput) {
    require(user, 'committee:meeting:manage');
    const meeting = await this.owned(user, meetingId);
    this.assertDecisionsEditable(meeting);
    assertVoteMatchesOutcome(input.status, input.votesFor, input.votesAgainst);
    if (input.ownerMemberId && !(await repository.findMember(user.churchId, input.ownerMemberId))) throw new ValidationError('Owner not found');
    await repository.createDecision({ meetingId, churchId: user.churchId, ...input, ownerMemberId: input.ownerMemberId ?? null, dueDate: input.dueDate ?? null });
    return this.get(user, meetingId);
  }

  async updateDecision(user: AuthorizedUser, decisionId: string, input: UpdateDecisionInput) {
    require(user, 'committee:meeting:manage');
    const decision = await this.ownedDecision(user, decisionId);
    this.assertDecisionsEditable(decision.meeting);
    assertVoteMatchesOutcome(input.status ?? decision.status, input.votesFor ?? decision.votesFor, input.votesAgainst ?? decision.votesAgainst);
    if (input.ownerMemberId && !(await repository.findMember(user.churchId, input.ownerMemberId))) throw new ValidationError('Owner not found');
    await repository.updateDecision(decisionId, input);
    return this.get(user, decision.meetingId);
  }

  async deleteDecision(user: AuthorizedUser, decisionId: string) {
    require(user, 'committee:meeting:manage');
    const decision = await this.ownedDecision(user, decisionId);
    this.assertDecisionsEditable(decision.meeting);
    await repository.deleteDecision(decisionId);
  }

  private assertDecisionsEditable(meeting: { status: string; minutesLockedAt: Date | null }) {
    if (meeting.minutesLockedAt) throw new ConflictError('The minutes are locked, so decisions can no longer be changed');
    if (meeting.status === 'CANCELLED') throw new ConflictError('A cancelled meeting cannot have decisions');
  }

  private async owned(user: AuthorizedUser, meetingId: string): Promise<MeetingRow> {
    const meeting = await repository.findMeeting(meetingId);
    if (!meeting || meeting.churchId !== user.churchId) throw new NotFoundError('Meeting');
    return meeting;
  }

  private async ownedDecision(user: AuthorizedUser, decisionId: string) {
    const decision = await repository.findDecision(decisionId);
    if (!decision || decision.churchId !== user.churchId) throw new NotFoundError('Decision');
    return decision;
  }

  private view(m: MeetingRow) {
    return {
      id: m.id, committeeId: m.committeeId, committeeName: m.committee.name, title: m.title, scheduledAt: m.scheduledAt, location: m.location,
      agenda: m.agenda, minutes: m.minutes, status: m.status, minutesLocked: m.minutesLockedAt !== null, minutesLockedAt: m.minutesLockedAt,
      decisions: m.decisions.map((d) => ({
        id: d.id, description: d.description, status: d.status, votesFor: d.votesFor, votesAgainst: d.votesAgainst, abstentions: d.abstentions,
        ownerMemberId: d.ownerMemberId, dueDate: d.dueDate,
      })),
    };
  }

  private async audit(user: AuthorizedUser, action: string, entityId: string, details: Record<string, unknown>) {
    try {
      await prisma.auditLog.create({ data: { churchId: user.churchId, action, entityType: 'COMMITTEE', entityId, actorId: user.memberId ?? user.id, changes: JSON.stringify(details) } });
    } catch (error) {
      logger.error({ err: error, action }, 'Failed to write committee audit log');
    }
  }
}

export const meetingService = new MeetingService();
