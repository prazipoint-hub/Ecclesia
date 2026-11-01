import { Prisma } from '@prisma/client';
import type { AuthorizedUser } from '@/types';
import { ConflictError, NotFoundError } from '@/types/errors';
import { eventEngagementRepository as repository } from '../repository/engagement';
import type { StaffRegistrationInput } from '../types/engagement';
import { audit, eventEnd, eventInChurch, memberOf, require } from './common';

type EventRow = NonNullable<Awaited<ReturnType<typeof repository.findEvent>>>;

export class RegistrationService {
  /** Upcoming events a member can sign up for, with spots left and whether they are already in. */
  async upcoming(user: AuthorizedUser) {
    const events = await repository.upcomingEvents(user.churchId, new Date(), 50);
    const mine = user.memberId ? new Set((await repository.myRegistrations(user.memberId, events.map((e) => e.id))).map((r) => r.eventId)) : new Set<string>();
    return events.map(({ _count, ...e }) => ({
      ...e,
      registered: _count.registrations,
      spotsLeft: e.capacity === null ? null : Math.max(e.capacity - _count.registrations, 0),
      registeredByMe: mine.has(e.id),
    }));
  }

  async registerSelf(user: AuthorizedUser, eventId: string) {
    const memberId = memberOf(user);
    const event = await eventInChurch(user, eventId);
    this.assertOpen(event);
    const member = await repository.findMember(user.churchId, memberId);
    if (!member || member.archivedAt) throw new NotFoundError('Member');
    return this.registerMember(user, event, { id: memberId, name: `${member.firstName} ${member.lastName}` }, memberId);
  }

  async cancelSelf(user: AuthorizedUser, eventId: string) {
    const memberId = memberOf(user);
    await eventInChurch(user, eventId);
    const result = await repository.cancelRegistration({ eventId, memberId });
    if (result.count === 0) throw new NotFoundError('Registration');
    return { cancelled: true };
  }

  async list(user: AuthorizedUser, eventId: string, query: { status?: string; skip: number; take: number }) {
    require(user, 'event:registration:manage');
    await eventInChurch(user, eventId);
    return repository.listRegistrations(eventId, query.status, query);
  }

  async registerByStaff(user: AuthorizedUser, eventId: string, input: StaffRegistrationInput) {
    require(user, 'event:registration:manage');
    const event = await eventInChurch(user, eventId);
    this.assertOpen(event);
    const registeredBy = user.memberId ?? user.id;
    if (input.memberId) {
      const member = await repository.findMember(user.churchId, input.memberId);
      if (!member || member.archivedAt) throw new NotFoundError('Member');
      return this.registerMember(user, event, { id: member.id, name: `${member.firstName} ${member.lastName}` }, registeredBy);
    }
    const guest = input.guest!;
    if (guest.email && (await repository.findGuestByEmail(event.id, guest.email))) throw new ConflictError('A guest with that email is already registered');
    const created = await repository.registerWithinCapacity(event.id, event.capacity, {
      churchId: user.churchId, eventId: event.id, memberId: null, name: guest.name, email: guest.email ?? null, phone: guest.phone ?? null, registeredBy,
    });
    if (!created) throw new ConflictError('This event is full');
    await audit(user, 'EVENT_GUEST_REGISTERED', event.id, { registrationId: created.id });
    return created;
  }

  async cancelByStaff(user: AuthorizedUser, eventId: string, registrationId: string) {
    require(user, 'event:registration:manage');
    await eventInChurch(user, eventId);
    const registration = await repository.findRegistrationById(user.churchId, eventId, registrationId);
    if (!registration) throw new NotFoundError('Registration');
    const result = await repository.cancelRegistration({ id: registrationId });
    if (result.count === 0) throw new ConflictError('This registration is already cancelled');
    await audit(user, 'EVENT_REGISTRATION_CANCELLED', eventId, { registrationId });
    return { cancelled: true };
  }

  private assertOpen(event: EventRow): void {
    if (event.status === 'CANCELLED') throw new ConflictError('This event was cancelled');
    if (event.status === 'COMPLETED' || eventEnd(event).getTime() < Date.now()) throw new ConflictError('This event has already taken place');
  }

  /** Registering twice is a no-op; re-registering after a cancellation takes the old row back, spot permitting. */
  private async registerMember(user: AuthorizedUser, event: EventRow, member: { id: string; name: string }, registeredBy: string) {
    const existing = await repository.findRegistration(event.id, member.id);
    if (existing?.status === 'REGISTERED') return existing;

    if (existing) {
      if (event.capacity !== null && (await repository.countRegistered(event.id)) >= event.capacity) throw new ConflictError('This event is full');
      await repository.reactivateRegistration(existing.id);
      return (await repository.findRegistration(event.id, member.id))!;
    }

    try {
      const created = await repository.registerWithinCapacity(event.id, event.capacity, {
        churchId: user.churchId, eventId: event.id, memberId: member.id, name: member.name, registeredBy,
      });
      if (!created) throw new ConflictError('This event is full');
      await audit(user, 'EVENT_REGISTERED', event.id, { memberId: member.id });
      return created;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return (await repository.findRegistration(event.id, member.id))!;
      throw error;
    }
  }
}

export const registrationService = new RegistrationService();
