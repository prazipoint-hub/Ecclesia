import { Prisma } from '@prisma/client';
import { prisma } from '@/database';

const memberSelect = { id: true, firstName: true, lastName: true, membershipNumber: true } as const;
type Page = { skip: number; take: number };

export class EventEngagementRepository {
  // ---- lookups
  findEvent(churchId: string, id: string) {
    return prisma.event.findFirst({ where: { id, churchId } });
  }
  findMember(churchId: string, id: string) {
    return prisma.member.findFirst({ where: { id, churchId }, select: { ...memberSelect, archivedAt: true, membershipStatus: true } });
  }
  findMemberByNumber(churchId: string, membershipNumber: string) {
    return prisma.member.findFirst({ where: { churchId, membershipNumber }, select: { ...memberSelect, archivedAt: true, membershipStatus: true } });
  }
  findChurchName(churchId: string) {
    return prisma.church.findUnique({ where: { id: churchId }, select: { name: true } });
  }

  // ---- check-in
  findCheckIn(eventId: string, memberId: string) {
    return prisma.eventCheckIn.findUnique({ where: { eventId_memberId: { eventId, memberId } } });
  }
  createCheckIn(data: Prisma.EventCheckInUncheckedCreateInput) {
    return prisma.eventCheckIn.create({ data });
  }
  markPresent(eventId: string, memberId: string, arrivedAt: Date) {
    return prisma.eventAttendance.upsert({
      where: { eventId_memberId: { eventId, memberId } },
      update: { status: 'PRESENT', arrivedAt },
      create: { eventId, memberId, status: 'PRESENT', arrivedAt },
    });
  }
  async listCheckIns(eventId: string, { skip, take }: Page) {
    const [items, total] = await Promise.all([
      prisma.eventCheckIn.findMany({ where: { eventId }, include: { member: { select: memberSelect } }, orderBy: { checkedInAt: 'desc' }, skip, take }),
      prisma.eventCheckIn.count({ where: { eventId } }),
    ]);
    return { items, total };
  }

  // ---- registration
  findRegistration(eventId: string, memberId: string) {
    return prisma.eventRegistration.findUnique({ where: { eventId_memberId: { eventId, memberId } } });
  }
  findRegistrationById(churchId: string, eventId: string, id: string) {
    return prisma.eventRegistration.findFirst({ where: { id, eventId, churchId } });
  }
  findGuestByEmail(eventId: string, email: string) {
    return prisma.eventRegistration.findFirst({ where: { eventId, memberId: null, email, status: 'REGISTERED' } });
  }
  countRegistered(eventId: string) {
    return prisma.eventRegistration.count({ where: { eventId, status: 'REGISTERED' } });
  }
  /** The capacity check and the insert share a transaction so a full event cannot be overbooked by a lone request. */
  registerWithinCapacity(eventId: string, capacity: number | null, data: Prisma.EventRegistrationUncheckedCreateInput) {
    return prisma.$transaction(async (tx) => {
      if (capacity !== null && (await tx.eventRegistration.count({ where: { eventId, status: 'REGISTERED' } })) >= capacity) return null;
      return tx.eventRegistration.create({ data });
    });
  }
  reactivateRegistration(id: string) {
    return prisma.eventRegistration.updateMany({ where: { id, status: 'CANCELLED' }, data: { status: 'REGISTERED', cancelledAt: null } });
  }
  cancelRegistration(where: Prisma.EventRegistrationWhereInput) {
    return prisma.eventRegistration.updateMany({ where: { ...where, status: 'REGISTERED' }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
  }
  async listRegistrations(eventId: string, status: string | undefined, { skip, take }: Page) {
    const where = { eventId, ...(status ? { status } : {}) };
    const [items, total] = await Promise.all([
      prisma.eventRegistration.findMany({ where, include: { member: { select: memberSelect } }, orderBy: { createdAt: 'asc' }, skip, take }),
      prisma.eventRegistration.count({ where }),
    ]);
    return { items, total };
  }
  upcomingEvents(churchId: string, now: Date, take: number) {
    return prisma.event.findMany({
      where: { churchId, status: 'SCHEDULED', startDateTime: { gte: now } },
      select: {
        id: true, title: true, description: true, eventType: true, startDateTime: true, endDateTime: true, location: true,
        capacity: true, registrationRequired: true, _count: { select: { registrations: { where: { status: 'REGISTERED' } } } },
      },
      orderBy: { startDateTime: 'asc' },
      take,
    });
  }
  myRegistrations(memberId: string, eventIds: string[]) {
    return prisma.eventRegistration.findMany({ where: { memberId, eventId: { in: eventIds }, status: 'REGISTERED' }, select: { eventId: true } });
  }

  // ---- volunteers
  createVolunteer(data: Prisma.VolunteerScheduleUncheckedCreateInput) {
    return prisma.volunteerSchedule.create({ data, include: { member: { select: memberSelect }, event: { select: { id: true, title: true, startDateTime: true } } } });
  }
  findVolunteer(churchId: string, id: string) {
    return prisma.volunteerSchedule.findFirst({ where: { id, churchId }, include: { member: { select: memberSelect }, event: { select: { id: true, title: true, startDateTime: true } } } });
  }
  async listVolunteers(where: Prisma.VolunteerScheduleWhereInput, { skip, take }: Page) {
    const [items, total] = await Promise.all([
      prisma.volunteerSchedule.findMany({
        where, include: { member: { select: memberSelect }, event: { select: { id: true, title: true, startDateTime: true } } },
        orderBy: { event: { startDateTime: 'asc' } }, skip, take,
      }),
      prisma.volunteerSchedule.count({ where }),
    ]);
    return { items, total };
  }
  claimVolunteer(id: string, from: string[], data: Prisma.VolunteerScheduleUncheckedUpdateManyInput) {
    return prisma.volunteerSchedule.updateMany({ where: { id, status: { in: from } }, data });
  }

  // ---- analytics
  eventsForAnalytics(where: Prisma.EventWhereInput) {
    return prisma.event.findMany({
      where,
      select: {
        id: true, title: true, eventType: true, startDateTime: true, expectedAttendance: true,
        _count: { select: { attendances: { where: { status: 'PRESENT' } }, registrations: { where: { status: 'REGISTERED' } } } },
      },
      orderBy: { startDateTime: 'asc' },
      take: 500,
    });
  }
  checkInMethods(eventIds: string[]) {
    return prisma.eventCheckIn.groupBy({ by: ['method'], where: { eventId: { in: eventIds } }, _count: { _all: true } });
  }
  distinctAttendees(eventIds: string[]) {
    return prisma.eventAttendance.groupBy({ by: ['memberId'], where: { eventId: { in: eventIds }, status: 'PRESENT' } });
  }

  // ---- absences
  recentEventsWithAttendance(churchId: string, eventType: string, now: Date, take: number) {
    return prisma.event.findMany({
      where: { churchId, eventType, status: 'COMPLETED', startDateTime: { lte: now }, attendances: { some: { status: 'PRESENT' } } },
      select: { id: true, startDateTime: true },
      orderBy: { startDateTime: 'desc' },
      take,
    });
  }
  absenceCandidates(churchId: string, eventIds: string[], joinedBefore: Date) {
    return prisma.member.findMany({
      where: {
        churchId, archivedAt: null, membershipStatus: 'ACTIVE', createdAt: { lte: joinedBefore },
        eventAttendances: { none: { eventId: { in: eventIds }, status: { in: ['PRESENT', 'EXCUSED'] } } },
        absenceFollowUps: { none: { openKey: 'OPEN' } },
      },
      select: memberSelect,
      orderBy: { lastName: 'asc' },
      take: 1000,
    });
  }
  createAbsenceFollowUps(data: Prisma.AbsenceFollowUpCreateManyInput[]) {
    return prisma.absenceFollowUp.createMany({ data, skipDuplicates: true });
  }
  findAbsence(churchId: string, id: string) {
    return prisma.absenceFollowUp.findFirst({ where: { id, churchId }, include: { member: { select: memberSelect } } });
  }
  async listAbsences(where: Prisma.AbsenceFollowUpWhereInput, { skip, take }: Page) {
    const [items, total] = await Promise.all([
      prisma.absenceFollowUp.findMany({ where, include: { member: { select: memberSelect } }, orderBy: { detectedAt: 'desc' }, skip, take }),
      prisma.absenceFollowUp.count({ where }),
    ]);
    return { items, total };
  }
  claimAbsence(id: string, from: string[], data: Prisma.AbsenceFollowUpUncheckedUpdateManyInput) {
    return prisma.absenceFollowUp.updateMany({ where: { id, status: { in: from } }, data });
  }
  updateAbsence(id: string, data: Prisma.AbsenceFollowUpUncheckedUpdateInput) {
    return prisma.absenceFollowUp.update({ where: { id }, data });
  }
}

export const eventEngagementRepository = new EventEngagementRepository();
