import { Prisma } from '@prisma/client';
import { prisma } from '@/database';
import { logger } from '@/config/logger';
import type { AuthorizedUser } from '@/types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/types/errors';
import { activeGrants, can } from '@/features/access/service/scope';
import { generateToken } from '@/features/auth/crypto';
import { emailService } from '@/services/email';
import { invitationEmail } from '@/services/email/templates';
import { nextMembershipNumbers } from '@/features/members/service/membershipNumber';
import { CIRCUIT_SECRETARY_PERMISSIONS, CIRCUIT_SECRETARY_ROLE, CIRCUIT_TRANSITIONS, type RegisterCircuitInput } from '../types/circuit';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const view = (c: {
  id: string; name: string; location: string | null; identificationNumber: string | null; status: string;
  registeredAt: Date | null; districtId: string | null; district?: { id: string; name: string; conference: { id: string; name: string } | null } | null;
}) => ({
  id: c.id, name: c.name, location: c.location, identificationNumber: c.identificationNumber, status: c.status, registeredAt: c.registeredAt,
  district: c.district ? { id: c.district.id, name: c.district.name } : null,
  conference: c.district?.conference ? { id: c.district.conference.id, name: c.district.conference.name } : null,
});

const include = { district: { include: { conference: true } } } as const;

export class CircuitService {
  /**
   * Register a Circuit. The server re-checks that the District really belongs to the
   * Conference the client named; the client-supplied pair is never trusted. A retried
   * submit with the same idempotency key returns the circuit it already created.
   */
  async register(user: AuthorizedUser, input: RegisterCircuitInput, idempotencyKey?: string) {
    // Authority is checked against the district being registered into: a District or Conference grant covers it, a grant elsewhere does not.
    if (!(await can(user, 'circuit:register', { type: 'DISTRICT', id: input.districtId }, { legacyGlobal: true }))) {
      throw new ForbiddenError('Forbidden: circuit:register permission required for this district');
    }

    if (idempotencyKey) {
      const existing = await prisma.circuit.findUnique({ where: { registrationKey: idempotencyKey }, include });
      if (existing) {
        if (existing.identificationNumber !== input.identificationNumber || existing.name !== input.name) {
          throw new ConflictError('This idempotency key was already used for a different circuit');
        }
        return { circuit: view(existing), created: false };
      }
    }

    const district = await prisma.district.findUnique({ where: { id: input.districtId }, include: { conference: true } });
    if (!district || !district.conference) throw new NotFoundError('District');
    if (district.conferenceId !== input.conferenceId) throw new ValidationError('That district does not belong to the selected conference');

    const duplicate = await prisma.circuit.findFirst({ where: { OR: [{ identificationNumber: input.identificationNumber }, { districtId: input.districtId, name: input.name }] } });
    if (duplicate) {
      throw new ConflictError(duplicate.identificationNumber === input.identificationNumber ? 'That circuit identification number is already registered' : 'A circuit with that name already exists in this district');
    }

    // The Secretary becomes a member of the first church. An email already held by a member or account anywhere is refused:
    // the person must be moved/linked by an administrator rather than duplicated or silently taken over.
    const email = input.secretary.email;
    if ((await prisma.member.findFirst({ where: { email }, select: { id: true } })) || (await prisma.user.findUnique({ where: { email }, select: { id: true } }))) {
      throw new ConflictError('That email already belongs to a member or account; resolve it before registering the circuit');
    }
    const [membershipNumber] = await nextMembershipNumbers(1);
    const { raw, hash } = generateToken();

    try {
      const created = await prisma.$transaction(async (tx) => {
        const circuit = await tx.circuit.create({
          data: {
            name: input.name, districtId: input.districtId, location: input.location ?? null, identificationNumber: input.identificationNumber,
            status: 'ACTIVE', registeredAt: new Date(), registeredBy: user.id, registrationKey: idempotencyKey ?? null,
          },
          include,
        });
        const church = await tx.church.create({ data: { circuitId: circuit.id, name: input.firstChurch.name, location: input.firstChurch.location ?? input.location ?? null } });
        const role = await tx.role.create({ data: { churchId: church.id, name: CIRCUIT_SECRETARY_ROLE, description: 'Sets up the circuit: membership, leadership and sections. No finance approval.' } });
        const perms = await tx.permission.findMany({ where: { name: { in: CIRCUIT_SECRETARY_PERMISSIONS } }, select: { id: true } });
        if (perms.length) await tx.rolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })) });
        const member = await tx.member.create({
          data: { churchId: church.id, firstName: input.secretary.firstName, lastName: input.secretary.lastName, email, phone: input.secretary.phone ?? null, membershipNumber, membershipStatus: 'ACTIVE' },
        });
        // Church-level capability for the existing church-scoped endpoints (they read the sign-in token), ...
        await tx.leadershipAssignment.create({ data: { churchId: church.id, memberId: member.id, roleId: role.id, position: CIRCUIT_SECRETARY_ROLE } });
        // ... and a circuit-scoped grant, applied only when the Secretary accepts the invitation.
        const invitation = await tx.invitation.create({
          data: {
            churchId: church.id, email, memberId: member.id, invitedBy: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
            grantRoleId: role.id, grantScopeType: 'CIRCUIT', grantScopeId: circuit.id,
          },
        });
        return { circuit, church, invitation };
      });
      await this.audit(user, 'CIRCUIT_REGISTERED', created.circuit.id, { identificationNumber: input.identificationNumber, districtId: input.districtId, firstChurchId: created.church.id });
      await this.sendInvite(email, raw, created.church.name, created.invitation.id);
      return {
        circuit: view(created.circuit), created: true, church: { id: created.church.id, name: created.church.name },
        secretaryInvitation: { id: created.invitation.id, email, expiresAt: created.invitation.expiresAt },
      };
    } catch (error) {
      // Two simultaneous submits can both pass the checks above; the unique indexes decide the winner.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        if (idempotencyKey) {
          const winner = await prisma.circuit.findUnique({ where: { registrationKey: idempotencyKey }, include });
          if (winner) return { circuit: view(winner), created: false };
        }
        throw new ConflictError('The registration conflicted with an existing record (identification number or secretary details); check them and retry');
      }
      throw error;
    }
  }

  /**
   * Re-issue the Secretary's invitation (lost email, expired link). Old pending links stop working.
   * Refused once the Secretary has accepted: access is then managed through normal assignments.
   */
  async resendSecretaryInvitation(user: AuthorizedUser, circuitId: string) {
    if (!(await can(user, 'circuit:register', { type: 'CIRCUIT', id: circuitId }, { legacyGlobal: true }))) throw new NotFoundError('Circuit');
    const pending = await prisma.invitation.findFirst({ where: { grantScopeType: 'CIRCUIT', grantScopeId: circuitId, acceptedAt: null, revokedAt: null }, orderBy: { createdAt: 'desc' } });
    if (!pending) throw new ConflictError('There is no pending secretary invitation for this circuit');
    const church = await prisma.church.findUnique({ where: { id: pending.churchId }, select: { name: true } });
    const { raw, hash } = generateToken();
    const claimed = await prisma.invitation.updateMany({ where: { id: pending.id, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    if (claimed.count === 0) throw new ConflictError('The invitation changed while you were working; reload and try again');
    const fresh = await prisma.invitation.create({
      data: {
        churchId: pending.churchId, email: pending.email, memberId: pending.memberId, invitedBy: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        grantRoleId: pending.grantRoleId, grantScopeType: pending.grantScopeType, grantScopeId: pending.grantScopeId,
      },
    });
    await this.audit(user, 'CIRCUIT_SECRETARY_INVITE_REISSUED', circuitId, { invitationId: fresh.id });
    await this.sendInvite(pending.email, raw, church?.name ?? 'your circuit', fresh.id);
    return { id: fresh.id, email: pending.email, expiresAt: fresh.expiresAt };
  }

  /** Email failure must not undo a committed registration; the registrar can resend. */
  private async sendInvite(email: string, raw: string, churchName: string, invitationId: string) {
    try {
      await emailService.send(invitationEmail(email, raw, churchName));
    } catch (error) {
      logger.error({ err: error, invitationId }, 'Failed to send circuit secretary invitation');
    }
  }

  async list(user: AuthorizedUser, query: { districtId?: string; take: number; skip: number }) {
    const where: Prisma.CircuitWhereInput = {};
    if (user.permissions.includes('circuit:view:all')) {
      if (query.districtId) where.districtId = query.districtId;
    } else {
      // Own church's circuit, plus whatever scoped grants carrying circuit:view cover.
      const ors: Prisma.CircuitWhereInput[] = [];
      if (user.permissions.includes('circuit:view')) {
        const church = await prisma.church.findUnique({ where: { id: user.churchId }, select: { circuitId: true } });
        if (church?.circuitId) ors.push({ id: church.circuitId });
      }
      for (const g of await activeGrants(user.id)) {
        if (!g.role.permissions.some((p) => p.permission.name === 'circuit:view')) continue;
        if (g.scopeType === 'CIRCUIT') ors.push({ id: g.scopeId });
        else if (g.scopeType === 'DISTRICT') ors.push({ districtId: g.scopeId });
        else if (g.scopeType === 'CONFERENCE') ors.push({ district: { conferenceId: g.scopeId } });
      }
      if (ors.length === 0) throw new ForbiddenError('Forbidden: circuit:view permission required');
      where.OR = ors;
    }
    const [rows, total] = await Promise.all([
      prisma.circuit.findMany({ where, include, orderBy: { name: 'asc' }, skip: query.skip, take: query.take }),
      prisma.circuit.count({ where }),
    ]);
    return { circuits: rows.map(view), total };
  }

  async changeStatus(user: AuthorizedUser, circuitId: string, status: string) {
    const circuit = await prisma.circuit.findUnique({ where: { id: circuitId }, include });
    if (!circuit || !(await can(user, 'circuit:register', { type: 'CIRCUIT', id: circuitId }, { legacyGlobal: true }))) throw new NotFoundError('Circuit');
    if (!(CIRCUIT_TRANSITIONS[circuit.status] ?? []).includes(status)) throw new ConflictError(`A ${circuit.status} circuit cannot become ${status}`);
    // Compare-and-set on the old status so two admins cannot both apply a transition.
    const result = await prisma.circuit.updateMany({ where: { id: circuitId, status: circuit.status }, data: { status } });
    if (result.count === 0) throw new ConflictError('The circuit status changed while you were editing; reload and try again');
    await this.audit(user, 'CIRCUIT_STATUS_CHANGED', circuitId, { from: circuit.status, to: status });
    return view({ ...circuit, status });
  }

  /** AuditLog is church-scoped and a Circuit has no church yet, so the event is filed under the acting user's church. */
  private async audit(user: AuthorizedUser, action: string, entityId: string, details: Record<string, unknown>) {
    try {
      await prisma.auditLog.create({ data: { churchId: user.churchId, action, entityType: 'CIRCUIT', entityId, actorId: user.memberId ?? user.id, changes: JSON.stringify(details) } });
    } catch (error) {
      logger.error({ err: error, action }, 'Failed to write circuit audit log');
    }
  }
}

export const circuitService = new CircuitService();
