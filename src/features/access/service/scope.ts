import { prisma } from '@/database';
import type { AuthorizedUser } from '@/types';

export const SCOPE_TYPES = ['CONFERENCE', 'DISTRICT', 'CIRCUIT', 'CHURCH', 'SECTION', 'ORGANIZATION'] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];
export type Scope = { type: ScopeType; id: string };

const key = (s: Scope) => `${s.type}:${s.id}`;

/**
 * The scope itself followed by every ancestor, nearest first. Returns null when the scope
 * does not exist, so callers cannot grant or test against a made-up id.
 * Mini-Conference is deliberately not a level (see docs/ecclesia-decisions.md).
 */
export async function scopeChain(scope: Scope): Promise<Scope[] | null> {
  const chain: Scope[] = [scope];
  let churchId: string | null = null;
  let circuitId: string | null = null;
  let districtId: string | null = null;
  let conferenceId: string | null = null;

  if (scope.type === 'ORGANIZATION') {
    const o = await prisma.organization.findUnique({ where: { id: scope.id }, select: { churchId: true } });
    if (!o) return null;
    churchId = o.churchId;
  } else if (scope.type === 'SECTION') {
    const s = await prisma.section.findUnique({ where: { id: scope.id }, select: { churchId: true } });
    if (!s) return null;
    churchId = s.churchId;
  } else if (scope.type === 'CHURCH') {
    churchId = scope.id;
  }

  if (churchId) {
    if (scope.type !== 'CHURCH') chain.push({ type: 'CHURCH', id: churchId });
    const c = await prisma.church.findUnique({ where: { id: churchId }, select: { circuitId: true } });
    if (!c) return null;
    circuitId = c.circuitId;
  } else if (scope.type === 'CIRCUIT') {
    circuitId = scope.id;
  }

  if (circuitId) {
    if (scope.type !== 'CIRCUIT') chain.push({ type: 'CIRCUIT', id: circuitId });
    const c = await prisma.circuit.findUnique({ where: { id: circuitId }, select: { districtId: true } });
    if (!c) return null;
    districtId = c.districtId;
  } else if (scope.type === 'DISTRICT') {
    districtId = scope.id;
  }

  if (districtId) {
    if (scope.type !== 'DISTRICT') chain.push({ type: 'DISTRICT', id: districtId });
    const d = await prisma.district.findUnique({ where: { id: districtId }, select: { conferenceId: true } });
    if (!d) return null;
    conferenceId = d.conferenceId;
  } else if (scope.type === 'CONFERENCE') {
    conferenceId = scope.id;
  }

  if (conferenceId) {
    if (scope.type !== 'CONFERENCE') chain.push({ type: 'CONFERENCE', id: conferenceId });
    if (scope.type === 'CONFERENCE') {
      const c = await prisma.conference.findUnique({ where: { id: scope.id }, select: { id: true } });
      if (!c) return null;
    }
  }
  return chain;
}

type Grant = { scopeType: string; scopeId: string; role: { permissions: Array<{ permission: { name: string } }> } };

/** Grants in force right now: started, not ended, not revoked. */
export async function activeGrants(userId: string, at = new Date()): Promise<Grant[]> {
  return (await prisma.scopedRoleAssignment.findMany({
    where: { userId, revokedAt: null, startsAt: { lte: at }, OR: [{ endsAt: null }, { endsAt: { gt: at } }] },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  })) as Grant[];
}

/** Permissions the user holds at `chain` through scoped grants (a grant at any chain member applies). */
export function permissionsAt(grants: Grant[], chain: Scope[]): Set<string> {
  const keys = new Set(chain.map(key));
  const out = new Set<string>();
  for (const g of grants) {
    if (keys.has(`${g.scopeType}:${g.scopeId}`)) g.role.permissions.forEach((p) => out.add(p.permission.name));
  }
  return out;
}

/**
 * True if the user may perform `permission` on the entity at `scope`.
 * `legacy` keeps today's behaviour: a JWT permission only counts for the user's own church.
 */
export async function can(user: AuthorizedUser, permission: string, scope: Scope, opts: { legacyGlobal?: boolean } = {}): Promise<boolean> {
  if (opts.legacyGlobal && user.permissions.includes(permission)) return true;
  const chain = await scopeChain(scope);
  if (!chain) return false;
  return permissionsAt(await activeGrants(user.id), chain).has(permission);
}
