import { Prisma } from '@prisma/client';
import type { AuthorizedUser } from '@/types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/types/errors';
import { eventEngagementRepository as repository } from '../repository/engagement';
import type { ManualCheckInInput } from '../types/engagement';
import { audit, checkInWindow, eventEnd, eventInChurch, memberOf, require } from './common';
import { qrDataUrl, signQr, verifyQr, type BadgeQrPayload, type EventQrPayload } from './qr';

const BADGE_SECONDS = 120;
type EventRow = NonNullable<Awaited<ReturnType<typeof repository.findEvent>>>;

export class CheckInService {
  /** The code shown at the door. It stays valid until check-in closes. */
  async eventQr(user: AuthorizedUser, eventId: string) {
    require(user, 'event:qr:generate');
    const event = await eventInChurch(user, eventId);
    await this.assertOpenForCheckIn(event, false);
    const { closes } = await checkInWindow(user.churchId, event);
    const { token, expiresAt } = signQr({ typ: 'event', eventId: event.id, churchId: user.churchId } satisfies EventQrPayload, (closes.getTime() - Date.now()) / 1000);
    await audit(user, 'EVENT_QR_GENERATED', event.id);
    return { token, expiresAt, dataUrl: await qrDataUrl(token) };
  }

  /** A member's personal badge, for an usher to scan. It expires in minutes so a screenshot is useless. */
  async myBadge(user: AuthorizedUser) {
    const memberId = memberOf(user);
    const { token, expiresAt } = signQr({ typ: 'badge', memberId, churchId: user.churchId } satisfies BadgeQrPayload, BADGE_SECONDS);
    return { token, expiresAt, dataUrl: await qrDataUrl(token) };
  }

  /** The member scans the door code with their own signed-in phone. */
  async selfCheckIn(user: AuthorizedUser, token: string) {
    const memberId = memberOf(user);
    const payload = verifyQr<EventQrPayload>(token, 'event');
    if (payload.churchId !== user.churchId) throw new ValidationError('This QR code is invalid or has expired');
    const event = await eventInChurch(user, payload.eventId);
    return this.checkIn(user, event, memberId, 'QR');
  }

  /** An usher scans the member's badge. */
  async scanBadge(user: AuthorizedUser, eventId: string, token: string) {
    require(user, 'event:checkin:manage');
    const payload = verifyQr<BadgeQrPayload>(token, 'badge');
    if (payload.churchId !== user.churchId) throw new ValidationError('This QR code is invalid or has expired');
    const event = await eventInChurch(user, eventId);
    return this.checkIn(user, event, payload.memberId, 'QR');
  }

  async manual(user: AuthorizedUser, eventId: string, input: ManualCheckInInput) {
    require(user, 'event:checkin:manage');
    const event = await eventInChurch(user, eventId);
    const member = input.memberId ? await repository.findMember(user.churchId, input.memberId) : await repository.findMemberByNumber(user.churchId, input.membershipNumber!);
    if (!member) throw new NotFoundError('Member');
    return this.checkIn(user, event, member.id, input.method);
  }

  async list(user: AuthorizedUser, eventId: string, query: { skip: number; take: number }) {
    require(user, 'event:checkin:manage');
    await eventInChurch(user, eventId);
    return repository.listCheckIns(eventId, query);
  }

  private async assertOpenForCheckIn(event: EventRow, enforceTime = true): Promise<void> {
    if (event.status === 'CANCELLED') throw new ConflictError('This event was cancelled');
    if (event.status === 'COMPLETED') throw new ConflictError('This event has finished');
    const { opens, closes } = await checkInWindow(event.churchId, event);
    if (!enforceTime && Date.now() > closes.getTime()) throw new ConflictError('Check-in for this event has closed');
    if (!enforceTime) return;
    const now = Date.now();
    if (now < opens.getTime()) throw new ConflictError(`Check-in opens at ${opens.toISOString()}`);
    if (now > closes.getTime()) throw new ConflictError('Check-in for this event has closed');
  }

  /** Idempotent: scanning twice, or two ushers at once, leaves a single record and reports it. */
  private async checkIn(user: AuthorizedUser, event: EventRow, memberId: string, method: 'QR' | 'MANUAL' | 'KIOSK') {
    await this.assertOpenForCheckIn(event);
    const member = await repository.findMember(user.churchId, memberId);
    if (!member) throw new NotFoundError('Member');
    if (member.archivedAt) throw new ForbiddenError('This member record is archived');

    if (event.registrationRequired) {
      const registration = await repository.findRegistration(event.id, memberId);
      if (!registration || registration.status !== 'REGISTERED') {
        throw new ConflictError('This event needs registration and this member is not registered');
      }
    }

    const now = new Date();
    let created = true;
    try {
      await repository.createCheckIn({ churchId: user.churchId, eventId: event.id, memberId, method, checkedInBy: user.memberId ?? user.id, checkedInAt: now });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
      created = false;
    }
    // Always converge attendance on PRESENT, even when an earlier attempt stopped half way.
    const existing = created ? null : await repository.findCheckIn(event.id, memberId);
    await repository.markPresent(event.id, memberId, existing?.checkedInAt ?? now);
    if (created) await audit(user, 'EVENT_CHECKIN', event.id, { memberId, method });
    return {
      alreadyCheckedIn: !created,
      checkedInAt: existing?.checkedInAt ?? now,
      method: existing?.method ?? method,
      member: { id: member.id, firstName: member.firstName, lastName: member.lastName, membershipNumber: member.membershipNumber },
      event: { id: event.id, title: event.title, endsAt: eventEnd(event) },
    };
  }
}

export const checkInService = new CheckInService();
