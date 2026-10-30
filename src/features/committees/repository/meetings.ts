import { Prisma } from '@prisma/client';
import { prisma } from '@/database';

export class MeetingRepository {
  findCommittee(churchId: string, committeeId: string) {
    return prisma.committee.findFirst({ where: { id: committeeId, churchId }, select: { id: true, name: true } });
  }

  findMember(churchId: string, memberId: string) {
    return prisma.member.findFirst({ where: { id: memberId, churchId }, select: { id: true } });
  }

  createMeeting(data: Prisma.CommitteeMeetingUncheckedCreateInput) {
    return prisma.committeeMeeting.create({ data });
  }

  findMeeting(id: string) {
    return prisma.committeeMeeting.findUnique({ where: { id }, include: { decisions: { orderBy: { createdAt: 'asc' } }, committee: { select: { name: true } } } });
  }

  updateMeeting(id: string, data: Prisma.CommitteeMeetingUncheckedUpdateInput) {
    return prisma.committeeMeeting.update({ where: { id }, data });
  }

  /** Conditional update used to enforce the minutes lock without a read-then-write race. */
  async updateIfUnlocked(id: string, data: Prisma.CommitteeMeetingUncheckedUpdateInput): Promise<boolean> {
    const result = await prisma.committeeMeeting.updateMany({ where: { id, minutesLockedAt: null }, data });
    return result.count === 1;
  }

  async listMeetings(where: Prisma.CommitteeMeetingWhereInput, skip: number, take: number) {
    return Promise.all([
      prisma.committeeMeeting.findMany({ where, skip, take, orderBy: { scheduledAt: 'desc' }, include: { _count: { select: { decisions: true } } } }),
      prisma.committeeMeeting.count({ where }),
    ]);
  }

  createDecision(data: Prisma.CommitteeDecisionUncheckedCreateInput) {
    return prisma.committeeDecision.create({ data });
  }

  findDecision(id: string) {
    return prisma.committeeDecision.findUnique({ where: { id }, include: { meeting: { select: { id: true, churchId: true, minutesLockedAt: true, status: true } } } });
  }

  updateDecision(id: string, data: Prisma.CommitteeDecisionUncheckedUpdateInput) {
    return prisma.committeeDecision.update({ where: { id }, data });
  }

  deleteDecision(id: string) {
    return prisma.committeeDecision.delete({ where: { id } });
  }
}

export const meetingRepository = new MeetingRepository();
