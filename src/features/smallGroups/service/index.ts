import { Prisma } from '@prisma/client';
import { audit, require } from '@/features/shared';
import type { AuthorizedUser } from '@/types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/types/errors';
import { smallGroupRepository as repository } from '../repository';
import type { CreateGroupInput, CreateSessionInput, GroupListQuery, UpdateGroupInput } from '../types';

type GroupRow = NonNullable<Awaited<ReturnType<typeof repository.find>>>;
const DAY = 24 * 60 * 60 * 1000;

const groupView = (g: GroupRow) => ({
  id: g.id, name: g.name, description: g.description, meetingDay: g.meetingDay, meetingTime: g.meetingTime, location: g.location,
  curriculumName: g.curriculumName, capacity: g.capacity, status: g.status,
  members: g.members.map((m) => ({ membershipId: m.id, memberId: m.memberId, name: `${m.member.firstName} ${m.member.lastName}`, membershipNumber: m.member.membershipNumber, role: m.role, joinedAt: m.joinedAt })),
});

export class SmallGroupService {
  async list(user: AuthorizedUser, query: GroupListQuery) {
    require(user, 'group:view');
    const { items, total } = await repository.list(user.churchId, query);
    return {
      items: items.map((g) => ({ id: g.id, name: g.name, meetingDay: g.meetingDay, meetingTime: g.meetingTime, location: g.location, status: g.status, capacity: g.capacity, memberCount: g._count.members })),
      total,
    };
  }

  async get(user: AuthorizedUser, id: string) {
    require(user, 'group:view');
    return groupView(await this.find(user, id));
  }

  async create(user: AuthorizedUser, input: CreateGroupInput) {
    require(user, 'group:manage');
    try {
      const group = await repository.create({ churchId: user.churchId, ...input, description: input.description ?? null, meetingDay: input.meetingDay ?? null, meetingTime: input.meetingTime ?? null, location: input.location ?? null, curriculumName: input.curriculumName ?? null, capacity: input.capacity ?? null });
      await audit(user, 'GROUP_CREATED', 'SMALL_GROUP', group.id, { name: group.name });
      return groupView(await this.find(user, group.id));
    } catch (e) {
      throw this.nameClash(e);
    }
  }

  async update(user: AuthorizedUser, id: string, input: UpdateGroupInput) {
    require(user, 'group:manage');
    const group = await this.find(user, id);
    if (input.capacity != null && input.capacity < group.members.length) throw new ConflictError(`The group already has ${group.members.length} members`);
    try {
      await repository.update(id, input);
    } catch (e) {
      throw this.nameClash(e);
    }
    await audit(user, 'GROUP_UPDATED', 'SMALL_GROUP', id, { changes: input });
    return groupView(await this.find(user, id));
  }

  async addMember(user: AuthorizedUser, groupId: string, input: { memberId: string; role: string }) {
    require(user, 'group:manage');
    const group = await this.find(user, groupId);
    this.assertOpen(group);
    const member = await repository.findMember(user.churchId, input.memberId);
    if (!member) throw new NotFoundError('Member');
    if (member.archivedAt) throw new ForbiddenError('This member record is archived');
    if (await repository.activeMembership(groupId, member.id)) throw new ConflictError('This person is already in the group');
    const added = await repository.addMember(groupId, member.id, input.role, group.capacity);
    if (!added) throw new ConflictError('The group is full');
    await audit(user, 'GROUP_MEMBER_ADDED', 'SMALL_GROUP', groupId, { memberId: member.id, role: input.role });
    return groupView(await this.find(user, groupId));
  }

  async setMemberRole(user: AuthorizedUser, groupId: string, membershipId: string, role: string) {
    require(user, 'group:manage');
    await this.find(user, groupId);
    if (!(await repository.findMembership(groupId, membershipId))) throw new NotFoundError('Group member');
    await repository.setRole(membershipId, role);
    await audit(user, 'GROUP_MEMBER_ROLE_CHANGED', 'SMALL_GROUP', groupId, { membershipId, role });
    return groupView(await this.find(user, groupId));
  }

  /** Leaving keeps the row, so past attendance stays attached to the person. */
  async removeMember(user: AuthorizedUser, groupId: string, membershipId: string) {
    require(user, 'group:manage');
    await this.find(user, groupId);
    const result = await repository.leave(groupId, membershipId, new Date());
    if (result.count === 0) throw new NotFoundError('Group member');
    await audit(user, 'GROUP_MEMBER_REMOVED', 'SMALL_GROUP', groupId, { membershipId });
    return groupView(await this.find(user, groupId));
  }

  async recordSession(user: AuthorizedUser, groupId: string, input: CreateSessionInput) {
    require(user, 'group:attendance:record');
    const group = await this.find(user, groupId);
    this.assertOpen(group);
    if (input.heldOn.getTime() > Date.now() + DAY) throw new ValidationError('A session cannot be recorded for a future date');
    const rows = await this.checkAttendance(groupId, input.attendance);
    const session = await repository.createSession(groupId, { heldOn: input.heldOn, topic: input.topic, lesson: input.lesson ?? null, notes: input.notes ?? null, recordedBy: user.memberId ?? user.id }, rows);
    await audit(user, 'GROUP_SESSION_RECORDED', 'SMALL_GROUP', groupId, { sessionId: session.id, attendees: rows.filter((r) => r.present).length });
    return this.sessionView(user, groupId, session.id);
  }

  async setAttendance(user: AuthorizedUser, groupId: string, sessionId: string, attendance: Array<{ membershipId: string; present: boolean }>) {
    require(user, 'group:attendance:record');
    await this.find(user, groupId);
    if (!(await repository.findSession(groupId, sessionId))) throw new NotFoundError('Session');
    await repository.replaceAttendance(sessionId, await this.checkAttendance(groupId, attendance));
    await audit(user, 'GROUP_ATTENDANCE_CORRECTED', 'SMALL_GROUP', groupId, { sessionId });
    return this.sessionView(user, groupId, sessionId);
  }

  async listSessions(user: AuthorizedUser, groupId: string, query: { skip: number; take: number }) {
    require(user, 'group:view');
    await this.find(user, groupId);
    const { items, total } = await repository.listSessions(groupId, query.skip, query.take);
    return {
      items: items.map((s) => ({ id: s.id, heldOn: s.heldOn, topic: s.topic, lesson: s.lesson, present: s.attendance.filter((a) => a.present).length, recorded: s.attendance.length })),
      total,
    };
  }

  async getSession(user: AuthorizedUser, groupId: string, sessionId: string) {
    require(user, 'group:view');
    return this.sessionView(user, groupId, sessionId);
  }

  /** Shared by reads and by writes that return the result, so a write never needs the view permission as well. */
  private async sessionView(user: AuthorizedUser, groupId: string, sessionId: string) {
    await this.find(user, groupId);
    const s = await repository.findSession(groupId, sessionId);
    if (!s) throw new NotFoundError('Session');
    return {
      id: s.id, heldOn: s.heldOn, topic: s.topic, lesson: s.lesson, notes: s.notes,
      attendance: s.attendance.map((a) => ({ membershipId: a.membershipId, memberId: a.membership.memberId, name: `${a.membership.member.firstName} ${a.membership.member.lastName}`, present: a.present })),
    };
  }

  /** Attendance rate per current member over all sessions where they were on the register. */
  async attendanceSummary(user: AuthorizedUser, groupId: string) {
    require(user, 'group:view');
    const group = await this.find(user, groupId);
    const [rows, sessions] = await Promise.all([repository.attendanceForGroup(groupId), repository.sessionCount(groupId)]);
    return {
      sessions,
      members: group.members.map((m) => {
        const mine = rows.filter((r) => r.membershipId === m.id);
        const present = mine.filter((r) => r.present).length;
        return { membershipId: m.id, memberId: m.memberId, name: `${m.member.firstName} ${m.member.lastName}`, recorded: mine.length, present, rate: mine.length ? Math.round((present / mine.length) * 100) : null };
      }),
    };
  }

  // ----------------------------------------------------------------------
  private async find(user: AuthorizedUser, id: string): Promise<GroupRow> {
    const group = await repository.find(user.churchId, id);
    if (!group) throw new NotFoundError('Group');
    return group;
  }
  private assertOpen(group: GroupRow) {
    if (group.status === 'CLOSED') throw new ConflictError('This group is closed');
  }
  /** Only current members of this very group can be marked, each once. */
  private async checkAttendance(groupId: string, attendance: Array<{ membershipId: string; present: boolean }>) {
    const valid = new Set((await repository.activeMembershipIds(groupId)).map((m) => m.id));
    const seen = new Set<string>();
    for (const a of attendance) {
      if (!valid.has(a.membershipId)) throw new ValidationError('Attendance includes someone who is not a current member of this group');
      if (seen.has(a.membershipId)) throw new ValidationError('A member appears twice in the attendance list');
      seen.add(a.membershipId);
    }
    return attendance;
  }
  private nameClash(e: unknown) {
    return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' ? new ConflictError('A group with that name already exists') : e;
  }
}

export const smallGroupService = new SmallGroupService();
