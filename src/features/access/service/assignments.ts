import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/database';
import { logger } from '@/config/logger';
import type { AuthorizedUser } from '@/types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/types/errors';
import { SCOPE_TYPES, activeGrants, permissionsAt, scopeChain, type Scope } from './scope';

export const AssignSchema = z.object({
  userId: z.string().min(1),
  roleId: z.string().min(1),
  scopeType: z.enum(SCOPE_TYPES),
  scopeId: z.string().min(1),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
});
export type AssignInput = z.infer<typeof AssignSchema>;

const GLOBAL = 'access:assign:global';
const key = (s: Scope) => `${s.type}:${s.id}`;

export class AssignmentService {
  /** Grant a role to an account at a scope. See the checks below: each one closes a specific escalation path. */
  async assign(actor: AuthorizedUser, input: AssignInput, source: { type: 'MANUAL' | 'APPOINTMENT'; id?: string } = { type: 'MANUAL' }) {
    const scope: Scope = { type: input.scopeType, id: input.scopeId };
    const chain = await scopeChain(scope);
    if (!chain) throw new NotFoundError('Scope');

    const isGlobal = actor.permissions.includes(GLOBAL);
    const mine = permissionsAt(await activeGrants(actor.id), chain);
    if (!isGlobal && !mine.has('access:assign')) throw new ForbiddenError('Forbidden: access:assign is required at this scope');
    if (input.userId === actor.id) throw new ForbiddenError('You cannot change your own access');

    const [target, role] = await Promise.all([
      prisma.user.findUnique({ where: { id: input.userId }, select: { id: true, disabledAt: true } }),
      prisma.role.findUnique({ where: { id: input.roleId }, include: { permissions: { include: { permission: true } } } }),
    ]);
    if (!target || target.disabledAt) throw new NotFoundError('User');
    if (!role) throw new NotFoundError('Role');

    // The role must be defined inside the scope it is being granted for, so a District grant cannot borrow another district's role.
    const roleChain = await scopeChain({ type: 'CHURCH', id: role.churchId });
    if (!roleChain || !roleChain.some((s) => key(s) === key(scope))) throw new ValidationError('That role does not belong to the selected scope');

    // No escalation: you can only hand out permissions you hold at this scope yourself.
    const names = role.permissions.map((p) => p.permission.name);
    if (!isGlobal) {
      const missing = names.filter((n) => !mine.has(n));
      if (missing.length) throw new ForbiddenError(`You cannot grant permissions you do not hold here: ${missing.slice(0, 5).join(', ')}`);
    }

    const now = new Date();
    const startsAt = input.startsAt ?? now;
    if (input.endsAt && input.endsAt <= startsAt) throw new ValidationError('endsAt must be after startsAt');
    if (input.endsAt && input.endsAt <= now) throw new ValidationError('endsAt is already in the past');

    const sourceId = source.id ?? '';
    const where = { userId: input.userId, roleId: input.roleId, scopeType: input.scopeType, scopeId: input.scopeId, sourceType: source.type, sourceId };
    const existing = await prisma.scopedRoleAssignment.findFirst({ where: { ...where, revokedAt: null, OR: [{ endsAt: null }, { endsAt: { gt: now } }] } });
    if (existing) return { assignment: existing, created: false };

    try {
      const assignment = await prisma.scopedRoleAssignment.create({ data: { ...where, startsAt, endsAt: input.endsAt ?? null, createdBy: actor.id } });
      await this.audit(actor, 'SCOPED_ROLE_ASSIGNED', assignment.id, { userId: input.userId, roleId: input.roleId, scope, endsAt: input.endsAt });
      return { assignment, created: true };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictError('That grant already exists (revoked grants must be re-created by an administrator)');
      throw error;
    }
  }

  /** Revoke now. Only the grant itself is touched: the same person's other grants, including those from other appointments, stay. */
  async revoke(actor: AuthorizedUser, assignmentId: string, reason?: string) {
    const a = await prisma.scopedRoleAssignment.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundError('Assignment');
    const chain = await scopeChain({ type: a.scopeType as Scope['type'], id: a.scopeId });
    const allowed = actor.permissions.includes(GLOBAL) || (chain !== null && permissionsAt(await activeGrants(actor.id), chain).has('access:assign'));
    // Same answer as "missing" for people with no business here.
    if (!allowed) throw new NotFoundError('Assignment');
    if (a.userId === actor.id) throw new ForbiddenError('You cannot change your own access');
    const result = await prisma.scopedRoleAssignment.updateMany({ where: { id: assignmentId, revokedAt: null }, data: { revokedAt: new Date(), revokedBy: actor.id } });
    if (result.count === 0) throw new ConflictError('Already revoked');
    await this.audit(actor, 'SCOPED_ROLE_REVOKED', assignmentId, { userId: a.userId, roleId: a.roleId, scope: { type: a.scopeType, id: a.scopeId }, reason });
    return { id: assignmentId, revoked: true };
  }

  /** Contexts the signed-in account can switch between: just its own active grants. */
  async myContexts(user: AuthorizedUser) {
    const rows = await prisma.scopedRoleAssignment.findMany({
      where: { userId: user.id, revokedAt: null, startsAt: { lte: new Date() }, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
      include: { role: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({ id: r.id, role: r.role, scope: { type: r.scopeType, id: r.scopeId }, endsAt: r.endsAt }));
  }

  private async audit(actor: AuthorizedUser, action: string, entityId: string, details: Record<string, unknown>) {
    try {
      await prisma.auditLog.create({ data: { churchId: actor.churchId, action, entityType: 'ACCESS', entityId, actorId: actor.memberId ?? actor.id, changes: JSON.stringify(details) } });
    } catch (error) {
      logger.error({ err: error, action }, 'Failed to write access audit log');
    }
  }
}

export const assignmentService = new AssignmentService();
