import { Prisma } from '@prisma/client';
import { prisma } from '@/database';
import { logger } from '@/config/logger';
import type { AuthorizedUser } from '@/types';
import { ConflictError, ForbiddenError, NotFoundError } from '@/types/errors';

const need = (user: AuthorizedUser, permission: string) => {
  if (!user.permissions.includes(permission)) throw new ForbiddenError(`Forbidden: ${permission} permission required`);
};

/** In force right now: approved, started, and not past its exclusive end. Future, pending, revoked and expired are not. */
export const isEffective = (a: { status: string; termStart: Date; termEnd: Date | null }, at = new Date()) =>
  a.status === 'ACTIVE' && a.termStart <= at && (!a.termEnd || a.termEnd > at);

/** An inclusive end DATE ("2026-12-31") becomes the exclusive instant at the start of the next UTC day. */
export const exclusiveEnd = (isoDate: string) => new Date(new Date(`${isoDate}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000);

export class AppointmentService {
  /**
   * Make the scoped grants match a member's appointments. One grant per appointment (sourceId = appointment id) with
   * the appointment's own start and end, so a future appointment grants nothing yet and an expired one stops by itself,
   * with no job needed. Safe to call repeatedly. Does nothing for members without an account; call again when one is made.
   */
  async syncGrantsForMember(memberId: string) {
    const user = await prisma.user.findUnique({ where: { memberId }, select: { id: true, disabledAt: true } });
    if (!user || user.disabledAt) return 0;
    const appts = await prisma.appointment.findMany({ where: { memberId, status: 'ACTIVE' }, include: { position: { select: { mappedRoleId: true } } } });
    let touched = 0;
    for (const a of appts) {
      if (!a.position.mappedRoleId) continue; // unmapped positions grant nothing
      const existing = await prisma.scopedRoleAssignment.findFirst({ where: { userId: user.id, sourceType: 'APPOINTMENT', sourceId: a.id, revokedAt: null } });
      if (existing) {
        if (existing.roleId !== a.position.mappedRoleId || existing.endsAt?.getTime() !== a.termEnd?.getTime() || existing.startsAt.getTime() !== a.termStart.getTime()) {
          await prisma.scopedRoleAssignment.update({ where: { id: existing.id }, data: { roleId: a.position.mappedRoleId, startsAt: a.termStart, endsAt: a.termEnd } });
          touched += 1;
        }
        continue;
      }
      try {
        await prisma.scopedRoleAssignment.create({
          data: { userId: user.id, roleId: a.position.mappedRoleId, scopeType: a.scopeType, scopeId: a.scopeId, sourceType: 'APPOINTMENT', sourceId: a.id, startsAt: a.termStart, endsAt: a.termEnd, createdBy: a.approvedBy ?? a.createdBy },
        });
        touched += 1;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error; // already there: a concurrent sync won
      }
    }
    return touched;
  }

  async approve(user: AuthorizedUser, appointmentId: string) {
    need(user, 'leadership:appointment:approve');
    const a = await this.own(user, appointmentId);
    // Segregation: whoever proposed a privileged appointment cannot be the one to approve it.
    if (a.createdBy === user.id) throw new ForbiddenError('You cannot approve an appointment you created');
    const res = await prisma.appointment.updateMany({ where: { id: appointmentId, status: 'PENDING' }, data: { status: 'ACTIVE', approvedBy: user.id, approvedAt: new Date() } });
    if (res.count === 0) throw new ConflictError(`Only a pending appointment can be approved (this one is ${a.status})`);
    await this.syncGrantsForMember(a.memberId);
    await this.audit(user, 'APPOINTMENT_APPROVED', appointmentId, { memberId: a.memberId, positionId: a.positionId });
    return { id: appointmentId, status: 'ACTIVE' };
  }

  async revoke(user: AuthorizedUser, appointmentId: string, reason?: string) {
    need(user, 'leadership:appointment:manage');
    const a = await this.own(user, appointmentId);
    const res = await prisma.appointment.updateMany({ where: { id: appointmentId, status: { in: ['PENDING', 'ACTIVE'] } }, data: { status: 'REVOKED', revokedBy: user.id, revokedAt: new Date(), revokeReason: reason?.slice(0, 190) ?? null } });
    if (res.count === 0) throw new ConflictError(`This appointment is already ${a.status.toLowerCase()}`);
    // Only this appointment's own grants are revoked; the same person's other grants (other appointments, manual) stay.
    const grants = await prisma.scopedRoleAssignment.updateMany({ where: { sourceType: 'APPOINTMENT', sourceId: appointmentId, revokedAt: null }, data: { revokedAt: new Date(), revokedBy: user.id } });
    await this.audit(user, 'APPOINTMENT_REVOKED', appointmentId, { memberId: a.memberId, grantsRevoked: grants.count, reason });
    return { id: appointmentId, status: 'REVOKED', grantsRevoked: grants.count };
  }

  /** Register of appointments. `asOf` gives the historical register: who held what on that date (approved appointments only). */
  async list(user: AuthorizedUser, q: { asOf?: Date; status?: string; positionCode?: string; page: number; pageSize: number }) {
    need(user, 'leadership:appointment:view');
    const where: Prisma.AppointmentWhereInput = { churchId: user.churchId };
    if (q.status) where.status = q.status;
    if (q.positionCode) where.position = { code: q.positionCode };
    if (q.asOf) {
      where.status = { in: ['ACTIVE', 'ENDED'] };
      where.termStart = { lte: q.asOf };
      where.OR = [{ termEnd: null }, { termEnd: { gt: q.asOf } }];
    }
    const [rows, total] = await Promise.all([
      prisma.appointment.findMany({ where, include: { position: { select: { code: true, name: true, groupName: true } }, member: { select: { firstName: true, lastName: true, membershipNumber: true } } }, orderBy: [{ termStart: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      prisma.appointment.count({ where }),
    ]);
    const now = new Date();
    return {
      total,
      appointments: rows.map((a) => ({
        id: a.id, member: { id: a.memberId, name: `${a.member.firstName} ${a.member.lastName}`, membershipNumber: a.member.membershipNumber }, position: a.position,
        scope: { type: a.scopeType, id: a.scopeId }, department: a.department, termStart: a.termStart, termEnd: a.termEnd, status: a.status, current: isEffective(a, now),
      })),
    };
  }

  private async own(user: AuthorizedUser, id: string) {
    const a = await prisma.appointment.findUnique({ where: { id } });
    if (!a || a.churchId !== user.churchId) throw new NotFoundError('Appointment');
    return a;
  }

  private async audit(user: AuthorizedUser, action: string, entityId: string, details: Record<string, unknown>) {
    try {
      await prisma.auditLog.create({ data: { churchId: user.churchId, action, entityType: 'APPOINTMENT', entityId, actorId: user.memberId ?? user.id, changes: JSON.stringify(details) } });
    } catch (error) { logger.error({ err: error, action }, 'Failed to write appointment audit log'); }
  }
}
export const appointmentService = new AppointmentService();
