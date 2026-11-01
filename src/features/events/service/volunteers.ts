import { Prisma } from '@prisma/client';
import { notificationDispatcher } from '@/services/notifications';
import type { AuthorizedUser } from '@/types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/types/errors';
import { eventEngagementRepository as repository } from '../repository/engagement';
import type { CreateVolunteerInput, UpdateVolunteerInput, VolunteerListQuery } from '../types/engagement';
import { audit, eventInChurch, memberOf, require } from './common';

const FINAL = ['COMPLETED', 'NO_SHOW', 'CANCELLED'];

export class VolunteerService {
  async list(user: AuthorizedUser, query: VolunteerListQuery) {
    require(user, 'volunteer:schedule:view');
    const { eventId, memberId, status, from, to, skip, take } = query;
    return repository.listVolunteers(
      {
        churchId: user.churchId,
        ...(eventId ? { eventId } : {}), ...(memberId ? { memberId } : {}), ...(status ? { status } : {}),
        ...(from || to ? { event: { startDateTime: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } } : {}),
      },
      { skip, take }
    );
  }

  async mine(user: AuthorizedUser, query: { skip: number; take: number }) {
    const memberId = memberOf(user);
    return repository.listVolunteers({ churchId: user.churchId, memberId, status: { notIn: ['CANCELLED'] }, event: { startDateTime: { gte: new Date() } } }, query);
  }

  async assign(user: AuthorizedUser, input: CreateVolunteerInput) {
    require(user, 'volunteer:schedule:manage');
    const event = await eventInChurch(user, input.eventId);
    if (event.status === 'CANCELLED' || event.status === 'COMPLETED') throw new ConflictError('Volunteers cannot be scheduled for a cancelled or finished event');
    const member = await repository.findMember(user.churchId, input.memberId);
    if (!member || member.archivedAt) throw new NotFoundError('Member');
    try {
      const schedule = await repository.createVolunteer({
        churchId: user.churchId, eventId: event.id, memberId: member.id, role: input.role, notes: input.notes ?? null, assignedBy: user.memberId ?? user.id,
      });
      await audit(user, 'VOLUNTEER_ASSIGNED', event.id, { memberId: member.id, role: input.role });
      await this.tell(user, member.id, event.title, 'VOLUNTEER_ASSIGNED', `You have been asked to serve as ${input.role} at ${event.title}. Please confirm or decline.`, schedule.id);
      return schedule;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('That member already has this role at this event');
      }
      throw error;
    }
  }

  async update(user: AuthorizedUser, id: string, input: UpdateVolunteerInput) {
    require(user, 'volunteer:schedule:manage');
    const schedule = await repository.findVolunteer(user.churchId, id);
    if (!schedule) throw new NotFoundError('Volunteer assignment');
    if (FINAL.includes(schedule.status)) throw new ConflictError(`A ${schedule.status.toLowerCase().replace('_', ' ')} assignment can no longer be changed`);
    if ((input.status === 'COMPLETED' || input.status === 'NO_SHOW') && schedule.event.startDateTime.getTime() > Date.now()) {
      throw new ValidationError('An assignment cannot be marked completed or no-show before the event starts');
    }
    const claimed = await repository.claimVolunteer(id, ['ASSIGNED', 'CONFIRMED', 'DECLINED'], {
      ...(input.status ? { status: input.status } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    });
    if (claimed.count === 0) throw new ConflictError('This assignment was changed by someone else. Reload and try again.');
    await audit(user, 'VOLUNTEER_UPDATED', schedule.eventId, { id, from: schedule.status, to: input.status });
    if (input.status === 'CANCELLED') {
      await this.tell(user, schedule.memberId, schedule.event.title, 'VOLUNTEER_CANCELLED', `Your ${schedule.role} role at ${schedule.event.title} was cancelled.`, id);
    }
    return repository.findVolunteer(user.churchId, id);
  }

  /** A volunteer answers for themselves, and only for their own assignment. */
  async respond(user: AuthorizedUser, id: string, response: 'CONFIRMED' | 'DECLINED') {
    const memberId = memberOf(user);
    const schedule = await repository.findVolunteer(user.churchId, id);
    if (!schedule) throw new NotFoundError('Volunteer assignment');
    if (schedule.memberId !== memberId) throw new ForbiddenError('This assignment belongs to someone else');
    if (schedule.event.startDateTime.getTime() < Date.now()) throw new ConflictError('This event has already started');
    const from = response === 'CONFIRMED' ? ['ASSIGNED', 'DECLINED'] : ['ASSIGNED', 'CONFIRMED'];
    const claimed = await repository.claimVolunteer(id, from, { status: response, respondedAt: new Date() });
    if (claimed.count === 0) throw new ConflictError(`This assignment is ${schedule.status.toLowerCase().replace('_', ' ')} and cannot be ${response.toLowerCase()}`);
    await audit(user, 'VOLUNTEER_RESPONDED', schedule.eventId, { id, response });
    return repository.findVolunteer(user.churchId, id);
  }

  private async tell(user: AuthorizedUser, memberId: string, eventTitle: string, type: string, body: string, entityId: string) {
    await notificationDispatcher.notify(memberId, {
      churchId: user.churchId, category: 'EVENTS', type, title: `Volunteering: ${eventTitle}`, body, channels: ['IN_APP', 'EMAIL'], entityType: 'VOLUNTEER_SCHEDULE', entityId,
    });
  }
}

export const volunteerService = new VolunteerService();
