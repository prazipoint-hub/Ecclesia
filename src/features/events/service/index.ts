import { prisma } from '@/database';
import { AuthorizedUser } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { CreateEventDTO, RecordAttendanceDTO, UpdateEventDTO } from '../types';
import { eventRepository } from '../repository';

export class EventService {
  async list(filters: { status?: string; from?: Date; to?: Date; take?: number }, user: AuthorizedUser) {
    this.require(user, 'event:view');
    return eventRepository.list(user.churchId, filters);
  }

  async get(eventId: string, user: AuthorizedUser) {
    this.require(user, 'event:view');
    const event = await eventRepository.findById(eventId, user.churchId);
    if (!event) throw new Error('Event not found');
    return event;
  }

  async create(data: CreateEventDTO, user: AuthorizedUser) {
    this.require(user, 'event:create');
    const actorId = this.actorId(user);
    this.validateDates(data.startDateTime, data.endDateTime);
    await this.validateScope(data, user.churchId);
    const event = await eventRepository.create({ ...data, churchId: user.churchId, status: 'SCHEDULED' });
    await this.audit('EVENT_CREATED', event.id, actorId, user.churchId, { eventType: event.eventType, sectionId: event.sectionId, organizationId: event.organizationId });
    return event;
  }

  async update(eventId: string, data: UpdateEventDTO, user: AuthorizedUser) {
    this.require(user, 'event:update');
    const actorId = this.actorId(user);
    const existing = await this.get(eventId, user);
    this.validateDates(data.startDateTime ?? existing.startDateTime, data.endDateTime ?? existing.endDateTime ?? undefined);
    await this.validateScope(data, user.churchId);
    const event = await eventRepository.update(eventId, user.churchId, data);
    if (!event) throw new Error('Event not found');
    await this.audit('EVENT_UPDATED', eventId, actorId, user.churchId, { status: data.status, sectionId: data.sectionId, organizationId: data.organizationId });
    return event;
  }

  async listAttendance(eventId: string, user: AuthorizedUser) {
    this.require(user, 'event:view');
    const attendance = await eventRepository.listAttendance(eventId, user.churchId);
    if (!attendance) throw new Error('Event not found');
    return attendance;
  }

  async recordAttendance(eventId: string, data: RecordAttendanceDTO, user: AuthorizedUser) {
    this.require(user, 'event:attendance:record');
    const actorId = this.actorId(user);
    await this.get(eventId, user);
    const member = await prisma.member.findFirst({ where: { id: data.memberId, churchId: user.churchId }, select: { id: true } });
    if (!member) throw new Error('Member not found in this church');
    const attendance = await eventRepository.recordAttendance(eventId, data);
    await this.audit('EVENT_ATTENDANCE_RECORDED', eventId, actorId, user.churchId, { memberId: data.memberId, status: data.status });
    return attendance;
  }

  private require(user: AuthorizedUser, permission: string): void {
    if (!user.permissions.includes(permission)) throw new Error(`Forbidden: ${permission} permission required`);
  }

  private actorId(user: AuthorizedUser): string {
    if (!user.memberId) throw new Error('Invalid: a member-linked account is required for event management');
    return user.memberId;
  }

  private validateDates(start: Date, end?: Date): void {
    if (end && end < start) throw new Error('Invalid: event end date must be after its start date');
  }

  private async validateScope(data: Pick<CreateEventDTO & UpdateEventDTO, 'sectionId' | 'organizationId'>, churchId: string): Promise<void> {
    if (data.sectionId) {
      const section = await prisma.section.findFirst({ where: { id: data.sectionId, churchId }, select: { id: true } });
      if (!section) throw new Error('Section not found in this church');
    }
    if (data.organizationId) {
      const organization = await prisma.organization.findFirst({ where: { id: data.organizationId, churchId }, select: { id: true } });
      if (!organization) throw new Error('Organization not found in this church');
    }
  }

  private async audit(action: string, eventId: string, actorId: string, churchId: string, changes: Record<string, unknown>) {
    await prisma.auditLog.create({ data: { id: uuidv4(), action, entityType: 'EVENT', entityId: eventId, actorId, churchId, changes: JSON.stringify(changes), timestamp: new Date() } });
  }
}

export const eventService = new EventService();
