import { Prisma } from '@prisma/client';
import { prisma } from '@/database';

const memberSelect = { id: true, firstName: true, lastName: true, membershipNumber: true } as const;

export class SmallGroupRepository {
  async list(churchId: string, q: { q?: string; status?: string; skip: number; take: number }) {
    const where: Prisma.SmallGroupWhereInput = { churchId, ...(q.status ? { status: q.status } : {}), ...(q.q ? { name: { contains: q.q } } : {}) };
    const [items, total] = await Promise.all([
      prisma.smallGroup.findMany({ where, orderBy: { name: 'asc' }, skip: q.skip, take: q.take, include: { _count: { select: { members: { where: { leftAt: null } } } } } }),
      prisma.smallGroup.count({ where }),
    ]);
    return { items, total };
  }
  find(churchId: string, id: string) {
    return prisma.smallGroup.findFirst({ where: { id, churchId }, include: { members: { where: { leftAt: null }, include: { member: { select: memberSelect } }, orderBy: { joinedAt: 'asc' } } } });
  }
  create(data: Prisma.SmallGroupUncheckedCreateInput) {
    return prisma.smallGroup.create({ data });
  }
  update(id: string, data: Prisma.SmallGroupUncheckedUpdateInput) {
    return prisma.smallGroup.update({ where: { id }, data });
  }
  findMember(churchId: string, memberId: string) {
    return prisma.member.findFirst({ where: { id: memberId, churchId }, select: { ...memberSelect, archivedAt: true } });
  }
  activeMembership(groupId: string, memberId: string) {
    return prisma.smallGroupMember.findFirst({ where: { groupId, memberId, leftAt: null }, select: { id: true } });
  }
  /** Capacity is checked and the row added in one transaction. */
  addMember(groupId: string, memberId: string, role: string, capacity: number | null) {
    return prisma.$transaction(async (tx) => {
      if (capacity !== null && (await tx.smallGroupMember.count({ where: { groupId, leftAt: null } })) >= capacity) return null;
      return tx.smallGroupMember.create({ data: { groupId, memberId, role }, include: { member: { select: memberSelect } } });
    });
  }
  findMembership(groupId: string, id: string) {
    return prisma.smallGroupMember.findFirst({ where: { id, groupId, leftAt: null } });
  }
  setRole(id: string, role: string) {
    return prisma.smallGroupMember.update({ where: { id }, data: { role }, include: { member: { select: memberSelect } } });
  }
  /** Scoped to the group, so an id from another group (or church) matches nothing. */
  leave(groupId: string, id: string, now: Date) {
    return prisma.smallGroupMember.updateMany({ where: { id, groupId, leftAt: null }, data: { leftAt: now } });
  }
  activeMembershipIds(groupId: string) {
    return prisma.smallGroupMember.findMany({ where: { groupId, leftAt: null }, select: { id: true } });
  }
  createSession(groupId: string, data: { heldOn: Date; topic: string; lesson: string | null; notes: string | null; recordedBy: string }, rows: Array<{ membershipId: string; present: boolean }>) {
    return prisma.$transaction(async (tx) => {
      const session = await tx.smallGroupSession.create({ data: { groupId, ...data } });
      if (rows.length) await tx.smallGroupAttendance.createMany({ data: rows.map((r) => ({ sessionId: session.id, ...r })) });
      return session;
    });
  }
  replaceAttendance(sessionId: string, rows: Array<{ membershipId: string; present: boolean }>) {
    return prisma.$transaction(async (tx) => {
      await tx.smallGroupAttendance.deleteMany({ where: { sessionId } });
      if (rows.length) await tx.smallGroupAttendance.createMany({ data: rows.map((r) => ({ sessionId, ...r })) });
    });
  }
  async listSessions(groupId: string, skip: number, take: number) {
    const [items, total] = await Promise.all([
      prisma.smallGroupSession.findMany({ where: { groupId }, orderBy: { heldOn: 'desc' }, skip, take, include: { attendance: { select: { present: true } } } }),
      prisma.smallGroupSession.count({ where: { groupId } }),
    ]);
    return { items, total };
  }
  findSession(groupId: string, id: string) {
    return prisma.smallGroupSession.findFirst({ where: { id, groupId }, include: { attendance: { include: { membership: { include: { member: { select: memberSelect } } } } } } });
  }
  attendanceForGroup(groupId: string) {
    return prisma.smallGroupAttendance.findMany({ where: { session: { groupId } }, select: { membershipId: true, present: true } });
  }
  sessionCount(groupId: string) {
    return prisma.smallGroupSession.count({ where: { groupId } });
  }
}

export const smallGroupRepository = new SmallGroupRepository();
