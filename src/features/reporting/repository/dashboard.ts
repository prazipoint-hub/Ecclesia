import { prisma } from '@/database';

export class DashboardRepository {
  membersByStatus(churchId: string, sectionId?: string) {
    return prisma.member.groupBy({ by: ['membershipStatus'], where: { churchId, archivedAt: null, ...(sectionId ? { sectionId } : {}) }, _count: { _all: true } });
  }
  membersByGender(churchId: string, sectionId?: string) {
    return prisma.member.groupBy({ by: ['gender'], where: { churchId, archivedAt: null, membershipStatus: 'ACTIVE', ...(sectionId ? { sectionId } : {}) }, _count: { _all: true } });
  }
  newMembersSince(churchId: string, since: Date, sectionId?: string) {
    return prisma.member.count({ where: { churchId, archivedAt: null, joinDate: { gte: since }, ...(sectionId ? { sectionId } : {}) } });
  }
  findSection(churchId: string, id: string) {
    return prisma.section.findFirst({ where: { id, churchId }, select: { id: true, name: true } });
  }

  recentEvents(churchId: string, since: Date, sectionId?: string) {
    return prisma.event.findMany({
      where: { churchId, status: { in: ['ONGOING', 'COMPLETED'] }, startDateTime: { gte: since }, ...(sectionId ? { sectionId } : {}) },
      select: { id: true, title: true, eventType: true, startDateTime: true, expectedAttendance: true, _count: { select: { attendances: { where: { status: 'PRESENT' } } } } },
      orderBy: { startDateTime: 'asc' },
      take: 500,
    });
  }
  upcomingEvents(churchId: string, now: Date, take: number, sectionId?: string) {
    return prisma.event.findMany({
      where: { churchId, status: 'SCHEDULED', startDateTime: { gte: now }, ...(sectionId ? { sectionId } : {}) },
      select: { id: true, title: true, eventType: true, startDateTime: true, location: true },
      orderBy: { startDateTime: 'asc' },
      take,
    });
  }

  receiptsSince(churchId: string, since: Date) {
    return prisma.receipt.findMany({ where: { churchId, status: 'ISSUED', issuedAt: { gte: since } }, select: { amount: true, currency: true, incomeType: true, issuedAt: true }, take: 5000 });
  }
  spendingSince(churchId: string, since: Date) {
    return prisma.expenditure.findMany({ where: { churchId, status: { in: ['APPROVED', 'PAID'] }, approvedAt: { gte: since } }, select: { amount: true, approvedAt: true }, take: 5000 });
  }
  awaitingApproval(churchId: string) {
    return prisma.expenditure.count({ where: { churchId, status: 'SUBMITTED' } });
  }
  sectionReceiptsSince(sectionId: string, since: Date) {
    return prisma.sectionReceipt.findMany({ where: { sectionId, status: 'ISSUED', issuedAt: { gte: since } }, select: { amount: true, currency: true, issuedAt: true }, take: 5000 });
  }
  sectionSpendingSince(sectionId: string, since: Date) {
    return prisma.sectionExpenditure.findMany({ where: { sectionId, status: { in: ['APPROVED', 'PAID'] }, approvedAt: { gte: since } }, select: { amount: true, approvedAt: true }, take: 5000 });
  }

  openCases(churchId: string) {
    return prisma.pastoralCase.count({ where: { churchId, status: { notIn: ['RESOLVED', 'CLOSED'] } } });
  }
  overdueFollowUps(churchId: string, now: Date) {
    return prisma.pastoralFollowUp.count({ where: { churchId, status: { in: ['PENDING', 'OVERDUE'] }, dueDate: { lt: now } } });
  }

  // ---- hierarchy roll-ups (counts only, never personal or financial detail)
  findChurchChain(churchId: string) {
    return prisma.church.findUnique({
      where: { id: churchId },
      select: { id: true, circuitId: true, circuit: { select: { id: true, name: true, districtId: true, district: { select: { id: true, name: true, conferenceId: true, conference: { select: { id: true, name: true } } } } } } },
    });
  }
  churchesIn(where: { circuitId?: string; circuit?: { districtId?: string; district?: { conferenceId?: string } } }) {
    return prisma.church.findMany({ where, select: { id: true, name: true, circuit: { select: { name: true } } }, orderBy: { name: 'asc' }, take: 500 });
  }
  activeMembersByChurch(churchIds: string[]) {
    return prisma.member.groupBy({ by: ['churchId'], where: { churchId: { in: churchIds }, archivedAt: null, membershipStatus: 'ACTIVE' }, _count: { _all: true } });
  }
  attendanceByChurch(churchIds: string[], since: Date) {
    return prisma.event.findMany({
      where: { churchId: { in: churchIds }, status: { in: ['ONGOING', 'COMPLETED'] }, startDateTime: { gte: since } },
      select: { churchId: true, _count: { select: { attendances: { where: { status: 'PRESENT' } } } } },
      take: 5000,
    });
  }
}

export const dashboardRepository = new DashboardRepository();
