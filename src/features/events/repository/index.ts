import { Prisma } from '@prisma/client';
import { prisma } from '@/database';

const eventInclude = {
  section: { select: { id: true, name: true } },
  organization: { select: { id: true, name: true, shortName: true } },
  _count: { select: { attendances: true, participants: true } },
} satisfies Prisma.EventInclude;

export class EventRepository {
  async list(churchId: string, filters: { status?: string; from?: Date; to?: Date; take?: number }) {
    const where: Prisma.EventWhereInput = {
      churchId,
      ...(filters.status ? { status: filters.status } : {}),
      ...((filters.from || filters.to) ? { startDateTime: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } } : {}),
    };
    const [events, total] = await Promise.all([
      prisma.event.findMany({ where, include: eventInclude, orderBy: { startDateTime: 'asc' }, take: filters.take ?? 50 }),
      prisma.event.count({ where }),
    ]);
    return { events, total };
  }

  async findById(eventId: string, churchId: string) {
    return prisma.event.findFirst({ where: { id: eventId, churchId }, include: eventInclude });
  }

  async create(data: Prisma.EventUncheckedCreateInput) {
    return prisma.event.create({ data, include: eventInclude });
  }

  async update(eventId: string, churchId: string, data: Prisma.EventUncheckedUpdateInput) {
    const event = await prisma.event.findFirst({ where: { id: eventId, churchId }, select: { id: true } });
    if (!event) return null;
    return prisma.event.update({ where: { id: eventId }, data, include: eventInclude });
  }

  async listAttendance(eventId: string, churchId: string) {
    const event = await prisma.event.findFirst({ where: { id: eventId, churchId }, select: { id: true } });
    if (!event) return null;
    return prisma.eventAttendance.findMany({
      where: { eventId },
      include: { member: { select: { id: true, firstName: true, lastName: true, membershipNumber: true } } },
      orderBy: { member: { lastName: 'asc' } },
    });
  }

  async recordAttendance(eventId: string, data: { memberId: string; status: string; arrivedAt?: Date }) {
    return prisma.eventAttendance.upsert({
      where: { eventId_memberId: { eventId, memberId: data.memberId } },
      update: { status: data.status, arrivedAt: data.arrivedAt },
      create: { eventId, memberId: data.memberId, status: data.status, arrivedAt: data.arrivedAt },
      include: { member: { select: { id: true, firstName: true, lastName: true, membershipNumber: true } } },
    });
  }
}

export const eventRepository = new EventRepository();
