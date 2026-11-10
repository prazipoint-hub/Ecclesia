import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/database';
import type { AuthorizedUser } from '@/types';
import { ForbiddenError, NotFoundError, ValidationError } from '@/types/errors';
import { SCOPE_TYPES, activeGrants, can, permissionsAt, scopeChain, type Scope } from './scope';

/** Lookups the web screens need to assign roles safely: every one re-checks `access:assign` at the scope on the server. */
export const ScopeQuerySchema = z.object({ scopeType: z.enum(SCOPE_TYPES), scopeId: z.string().trim().min(1).max(64), q: z.string().trim().max(100).optional() });
const GLOBAL = 'access:assign:global';

/** Prisma filter selecting the churches inside a scope. */
async function churchWhere(scope: Scope): Promise<Prisma.ChurchWhereInput | null> {
  switch (scope.type) {
    case 'CHURCH': return { id: scope.id };
    case 'CIRCUIT': return { circuitId: scope.id };
    case 'DISTRICT': return { circuit: { districtId: scope.id } };
    case 'CONFERENCE': return { circuit: { district: { conferenceId: scope.id } } };
    case 'SECTION': { const s = await prisma.section.findUnique({ where: { id: scope.id }, select: { churchId: true } }); return s && { id: s.churchId }; }
    case 'ORGANIZATION': { const o = await prisma.organization.findUnique({ where: { id: scope.id }, select: { churchId: true } }); return o && { id: o.churchId }; }
  }
}

export class AccessDirectoryService {
  private async mine(actor: AuthorizedUser, scope: Scope) {
    const chain = await scopeChain(scope);
    if (!chain) throw new NotFoundError('Scope');
    const perms = permissionsAt(await activeGrants(actor.id), chain);
    const isGlobal = actor.permissions.includes(GLOBAL);
    if (!isGlobal && !perms.has('access:assign')) throw new ForbiddenError('Forbidden: access:assign is required at this scope');
    return { perms, isGlobal };
  }

  /** Conferences and districts the caller may register a circuit into (the same test the register endpoint applies). */
  async registrableUnits(actor: AuthorizedUser) {
    const districts = await prisma.district.findMany({ include: { conference: { select: { id: true, name: true } } }, orderBy: { name: 'asc' }, take: 500 });
    const allowed: typeof districts = [];
    for (const d of districts) if (await can(actor, 'circuit:register', { type: 'DISTRICT', id: d.id }, { legacyGlobal: true })) allowed.push(d);
    const conferences = new Map<string, { id: string; name: string }>();
    allowed.forEach((d) => d.conference && conferences.set(d.conference.id, d.conference));
    return { conferences: [...conferences.values()], districts: allowed.map((d) => ({ id: d.id, name: d.name, conferenceId: d.conferenceId })) };
  }

  async list(actor: AuthorizedUser, raw: unknown) {
    const { scopeType, scopeId } = ScopeQuerySchema.parse(raw);
    await this.mine(actor, { type: scopeType, id: scopeId });
    const now = new Date();
    const rows = await prisma.scopedRoleAssignment.findMany({
      where: { scopeType, scopeId, revokedAt: null, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      include: { role: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, take: 200,
    });
    const users = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, email: true } });
    const email = new Map(users.map((u) => [u.id, u.email]));
    return rows.map((r) => ({ id: r.id, userId: r.userId, email: email.get(r.userId) ?? null, role: r.role, sourceType: r.sourceType, endsAt: r.endsAt, createdAt: r.createdAt }));
  }

  /** Roles that can be granted at this scope: defined inside it, and (unless global) holding only permissions the caller holds there. */
  async assignableRoles(actor: AuthorizedUser, raw: unknown) {
    const { scopeType, scopeId } = ScopeQuerySchema.parse(raw);
    const scope = { type: scopeType, id: scopeId } as Scope;
    const { perms, isGlobal } = await this.mine(actor, scope);
    const where = await churchWhere(scope);
    if (!where) throw new NotFoundError('Scope');
    const roles = await prisma.role.findMany({ where: { church: where }, include: { permissions: { include: { permission: true } }, church: { select: { name: true } } }, orderBy: { name: 'asc' }, take: 300 });
    return roles
      .map((r) => ({ id: r.id, name: r.name, church: r.church.name, permissions: r.permissions.map((p) => p.permission.name) }))
      .filter((r) => isGlobal || r.permissions.every((p) => perms.has(p)))
      .map((r) => ({ id: r.id, name: r.name, church: r.church, permissionCount: r.permissions.length }));
  }

  /** Accounts belonging to churches inside the scope, found by email; at least three characters so this is not a directory dump. */
  async findUsers(actor: AuthorizedUser, raw: unknown) {
    const { scopeType, scopeId, q } = ScopeQuerySchema.parse(raw);
    if (!q || q.length < 3) throw new ValidationError('Type at least 3 characters of the email address');
    const scope = { type: scopeType, id: scopeId } as Scope;
    await this.mine(actor, scope);
    const where = await churchWhere(scope);
    if (!where) throw new NotFoundError('Scope');
    const churchIds = (await prisma.church.findMany({ where, select: { id: true }, take: 2000 })).map((c) => c.id);
    const users = await prisma.user.findMany({
      where: { email: { contains: q }, disabledAt: null, id: { not: actor.id }, OR: [{ churchId: { in: churchIds } }, { member: { churchId: { in: churchIds } } }] },
      select: { id: true, email: true, member: { select: { firstName: true, lastName: true } } }, orderBy: { email: 'asc' }, take: 20,
    });
    return users.map((u) => ({ id: u.id, email: u.email, name: u.member ? `${u.member.firstName} ${u.member.lastName}` : null }));
  }
}

export const accessDirectoryService = new AccessDirectoryService();
