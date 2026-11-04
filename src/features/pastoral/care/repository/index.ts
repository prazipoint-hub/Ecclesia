import { Prisma } from '@prisma/client';
import { prisma } from '@/database';

const memberSelect = { id: true, firstName: true, lastName: true, membershipNumber: true } as const;
const withMember = { member: { select: memberSelect } } as const;

type Page = { skip: number; take: number };

export class PastoralCareRepository {
  // ---- shared lookups
  findMember(churchId: string, id: string) {
    return prisma.member.findFirst({ where: { id, churchId }, select: { ...memberSelect, churchId: true, archivedAt: true } });
  }
  findCase(churchId: string, id: string) {
    return prisma.pastoralCase.findFirst({ where: { id, churchId } });
  }

  // ---- visits
  createVisit(data: Prisma.PastoralVisitUncheckedCreateInput) {
    return prisma.pastoralVisit.create({ data, include: withMember });
  }
  findVisit(churchId: string, id: string) {
    return prisma.pastoralVisit.findFirst({ where: { id, churchId }, include: withMember });
  }
  async listVisits(where: Prisma.PastoralVisitWhereInput, { skip, take }: Page) {
    const [items, total] = await Promise.all([
      prisma.pastoralVisit.findMany({ where, include: withMember, orderBy: { visitDate: 'desc' }, skip, take }),
      prisma.pastoralVisit.count({ where }),
    ]);
    return { items, total };
  }
  updateVisit(id: string, data: Prisma.PastoralVisitUncheckedUpdateInput) {
    return prisma.pastoralVisit.update({ where: { id }, data, include: withMember });
  }

  // ---- counseling
  createCounseling(data: Prisma.CounselingSessionUncheckedCreateInput) {
    return prisma.counselingSession.create({ data, include: withMember });
  }
  findCounseling(churchId: string, id: string) {
    return prisma.counselingSession.findFirst({ where: { id, churchId }, include: withMember });
  }
  async listCounseling(where: Prisma.CounselingSessionWhereInput, { skip, take }: Page) {
    const [items, total] = await Promise.all([
      prisma.counselingSession.findMany({ where, include: withMember, orderBy: { sessionDate: 'desc' }, skip, take }),
      prisma.counselingSession.count({ where }),
    ]);
    return { items, total };
  }
  updateCounseling(id: string, data: Prisma.CounselingSessionUncheckedUpdateInput) {
    return prisma.counselingSession.update({ where: { id }, data, include: withMember });
  }

  // ---- prayer
  createPrayer(data: Prisma.PrayerRequestUncheckedCreateInput) {
    return prisma.prayerRequest.create({ data, include: withMember });
  }
  findPrayer(churchId: string, id: string) {
    return prisma.prayerRequest.findFirst({ where: { id, churchId }, include: withMember });
  }
  async listPrayer(where: Prisma.PrayerRequestWhereInput, { skip, take }: Page) {
    const [items, total] = await Promise.all([
      prisma.prayerRequest.findMany({ where, include: withMember, orderBy: { submitted: 'desc' }, skip, take }),
      prisma.prayerRequest.count({ where }),
    ]);
    return { items, total };
  }
  /** Moves a prayer request only if it is still in the status the caller read. */
  claimPrayer(id: string, from: string, data: Prisma.PrayerRequestUncheckedUpdateManyInput) {
    return prisma.prayerRequest.updateMany({ where: { id, status: from }, data });
  }

  // ---- referrals
  createReferral(data: Prisma.PastoralReferralUncheckedCreateInput) {
    return prisma.pastoralReferral.create({ data, include: withMember });
  }
  findReferral(churchId: string, id: string) {
    return prisma.pastoralReferral.findFirst({ where: { id, churchId }, include: withMember });
  }
  async listReferrals(where: Prisma.PastoralReferralWhereInput, { skip, take }: Page) {
    const [items, total] = await Promise.all([
      prisma.pastoralReferral.findMany({ where, include: withMember, orderBy: { referralDate: 'desc' }, skip, take }),
      prisma.pastoralReferral.count({ where }),
    ]);
    return { items, total };
  }
  claimReferral(id: string, from: string, data: Prisma.PastoralReferralUncheckedUpdateManyInput) {
    return prisma.pastoralReferral.updateMany({ where: { id, status: from }, data });
  }

  // ---- follow-ups
  createFollowUp(data: Prisma.PastoralFollowUpUncheckedCreateInput) {
    return prisma.pastoralFollowUp.create({ data, include: withMember });
  }
  findFollowUp(churchId: string, id: string) {
    return prisma.pastoralFollowUp.findFirst({ where: { id, churchId }, include: withMember });
  }
  async listFollowUps(where: Prisma.PastoralFollowUpWhereInput, { skip, take }: Page) {
    const [items, total] = await Promise.all([
      prisma.pastoralFollowUp.findMany({ where, include: withMember, orderBy: { dueDate: 'asc' }, skip, take }),
      prisma.pastoralFollowUp.count({ where }),
    ]);
    return { items, total };
  }
  /** Only an open follow-up can be completed or cancelled; the status filter makes the move atomic. */
  closeFollowUp(id: string, data: Prisma.PastoralFollowUpUncheckedUpdateManyInput) {
    return prisma.pastoralFollowUp.updateMany({ where: { id, status: { in: ['PENDING', 'OVERDUE'] } }, data });
  }

  // ---- assessments
  createAssessment(data: Prisma.PastoralAssessmentUncheckedCreateInput) {
    return prisma.pastoralAssessment.create({ data });
  }
  async listAssessments(where: Prisma.PastoralAssessmentWhereInput, { skip, take }: Page) {
    const [items, total] = await Promise.all([
      prisma.pastoralAssessment.findMany({ where, orderBy: { assessedAt: 'desc' }, skip, take }),
      prisma.pastoralAssessment.count({ where }),
    ]);
    return { items, total };
  }

  // ---- sacraments (baptism / confirmation share a shape; marriage and funeral differ)
  createBaptism(data: Prisma.BaptismRecordUncheckedCreateInput) {
    return prisma.baptismRecord.create({ data, include: withMember });
  }
  findBaptism(churchId: string, id: string) {
    return prisma.baptismRecord.findFirst({ where: { id, churchId }, include: withMember });
  }
  findBaptismFor(churchId: string, memberId: string) {
    return prisma.baptismRecord.findFirst({ where: { churchId, memberId } });
  }
  async listBaptisms(where: Prisma.BaptismRecordWhereInput, { skip, take }: Page) {
    const [items, total] = await Promise.all([
      prisma.baptismRecord.findMany({ where, include: withMember, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.baptismRecord.count({ where }),
    ]);
    return { items, total };
  }
  claimBaptism(id: string, from: string, data: Prisma.BaptismRecordUncheckedUpdateManyInput) {
    return prisma.baptismRecord.updateMany({ where: { id, status: from }, data });
  }

  createConfirmation(data: Prisma.ConfirmationRecordUncheckedCreateInput) {
    return prisma.confirmationRecord.create({ data, include: withMember });
  }
  findConfirmation(churchId: string, id: string) {
    return prisma.confirmationRecord.findFirst({ where: { id, churchId }, include: withMember });
  }
  findConfirmationFor(churchId: string, memberId: string) {
    return prisma.confirmationRecord.findFirst({ where: { churchId, memberId } });
  }
  async listConfirmations(where: Prisma.ConfirmationRecordWhereInput, { skip, take }: Page) {
    const [items, total] = await Promise.all([
      prisma.confirmationRecord.findMany({ where, include: withMember, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.confirmationRecord.count({ where }),
    ]);
    return { items, total };
  }
  claimConfirmation(id: string, from: string, data: Prisma.ConfirmationRecordUncheckedUpdateManyInput) {
    return prisma.confirmationRecord.updateMany({ where: { id, status: from }, data });
  }

  findMarriageInvolving(churchId: string, memberIds: string[]) {
    return prisma.marriageRecord.findFirst({
      where: { churchId, status: { not: 'RECORDED' }, OR: [{ partner1Id: { in: memberIds } }, { partner2Id: { in: memberIds } }] },
    });
  }
  createMarriage(data: Prisma.MarriageRecordUncheckedCreateInput) {
    return prisma.marriageRecord.create({ data, include: { partner1: { select: memberSelect }, partner2: { select: memberSelect } } });
  }
  findMarriage(churchId: string, id: string) {
    return prisma.marriageRecord.findFirst({ where: { id, churchId }, include: { partner1: { select: memberSelect }, partner2: { select: memberSelect } } });
  }
  async listMarriages(where: Prisma.MarriageRecordWhereInput, { skip, take }: Page) {
    const [items, total] = await Promise.all([
      prisma.marriageRecord.findMany({ where, include: { partner1: { select: memberSelect }, partner2: { select: memberSelect } }, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.marriageRecord.count({ where }),
    ]);
    return { items, total };
  }
  claimMarriage(id: string, from: string, data: Prisma.MarriageRecordUncheckedUpdateManyInput) {
    return prisma.marriageRecord.updateMany({ where: { id, status: from }, data });
  }

  createFuneral(data: Prisma.FuneralRecordUncheckedCreateInput) {
    return prisma.funeralRecord.create({ data, include: { deceased: { select: memberSelect } } });
  }
  findFuneral(churchId: string, id: string) {
    return prisma.funeralRecord.findFirst({ where: { id, churchId }, include: { deceased: { select: memberSelect } } });
  }
  findFuneralFor(churchId: string, deceasedId: string) {
    return prisma.funeralRecord.findFirst({ where: { churchId, deceasedId } });
  }
  async listFunerals(where: Prisma.FuneralRecordWhereInput, { skip, take }: Page) {
    const [items, total] = await Promise.all([
      prisma.funeralRecord.findMany({ where, include: { deceased: { select: memberSelect } }, orderBy: { deathDate: 'desc' }, skip, take }),
      prisma.funeralRecord.count({ where }),
    ]);
    return { items, total };
  }
  updateFuneral(id: string, data: Prisma.FuneralRecordUncheckedUpdateInput) {
    return prisma.funeralRecord.update({ where: { id }, data, include: { deceased: { select: memberSelect } } });
  }

  // ---- dashboard / profile aggregates
  openCasesByPriority(churchId: string) {
    return prisma.pastoralCase.groupBy({ by: ['priority'], where: { churchId, status: { notIn: ['RESOLVED', 'CLOSED'] } }, _count: { _all: true } });
  }
  urgentCases(churchId: string, take: number) {
    return prisma.pastoralCase.findMany({
      where: { churchId, priority: { in: ['URGENT', 'HIGH'] }, status: { notIn: ['RESOLVED', 'CLOSED'] } },
      include: withMember,
      orderBy: [{ priority: 'desc' }, { openedAt: 'asc' }],
      take,
    });
  }
  countOverdueFollowUps(churchId: string, now: Date) {
    return prisma.pastoralFollowUp.count({ where: { churchId, status: { in: ['PENDING', 'OVERDUE'] }, dueDate: { lt: now } } });
  }
  upcomingFollowUps(churchId: string, now: Date, until: Date, take: number) {
    return prisma.pastoralFollowUp.findMany({
      where: { churchId, status: { in: ['PENDING', 'OVERDUE'] }, dueDate: { lte: until } },
      include: withMember,
      orderBy: { dueDate: 'asc' },
      take,
    });
  }
  countVisitsSince(churchId: string, since: Date) {
    return prisma.pastoralVisit.count({ where: { churchId, visitDate: { gte: since } } });
  }
  visitedMemberIdsSince(churchId: string, since: Date) {
    return prisma.pastoralVisit.groupBy({ by: ['memberId'], where: { churchId, visitDate: { gte: since } } });
  }
  countActiveMembers(churchId: string) {
    return prisma.member.count({ where: { churchId, archivedAt: null, membershipStatus: 'ACTIVE' } });
  }
  countPrayerByStatus(churchId: string) {
    return prisma.prayerRequest.groupBy({ by: ['status'], where: { churchId, visibility: { not: 'CONFIDENTIAL' } }, _count: { _all: true } });
  }
  latestAssessmentsFlagged(churchId: string, take: number) {
    return prisma.pastoralAssessment.findMany({
      where: {
        churchId,
        OR: [{ spiritual: 'FAITH_CRISIS' }, { emotional: 'CRISIS' }, { economic: 'FOOD_INSECURITY' }, { physical: 'HOSPITALIZED' }],
      },
      orderBy: { assessedAt: 'desc' },
      take,
    });
  }

  memberCases(churchId: string, memberId: string) {
    return prisma.pastoralCase.findMany({ where: { churchId, memberId }, orderBy: { openedAt: 'desc' }, take: 50 });
  }
  memberLifeEvents(churchId: string, memberId: string) {
    return prisma.lifeEvent.findMany({ where: { churchId, memberId }, orderBy: { eventDate: 'desc' }, take: 50 });
  }
  memberSpiritual(churchId: string, memberId: string) {
    return prisma.spiritualDevelopmentRecord.findMany({ where: { churchId, memberId }, orderBy: { recordedAt: 'desc' }, take: 50 });
  }
}

export const pastoralCareRepository = new PastoralCareRepository();
