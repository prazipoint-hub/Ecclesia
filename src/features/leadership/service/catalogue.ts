import { prisma } from '@/database';
import { logger } from '@/config/logger';
import type { AuthorizedUser } from '@/types';
import { ForbiddenError, NotFoundError, ValidationError } from '@/types/errors';

/** Source positions (guide §7.3) plus Pastor and Finance Secretary. Group → names. Edit data, not code, to extend. */
const GENERAL: Record<string, string[]> = {
  'Church executive and administration': ['Pastor', 'Lay Leader', 'Council Chair', 'Vice Council Chair', 'Council Secretary', 'Vice Council Secretary', 'Finance Chair', 'Vice Finance Chair', 'Finance Secretary', 'Chief Recording Secretary', 'Recording Secretary', 'Treasurer'],
  'Audit Committee': ['Audit Chairperson', 'Audit Vice Chairperson', 'Audit Committee Member'],
  'Projects Committee': ['Projects Chair', 'Projects Vice Chair', 'Projects Committee Member'],
  'Business Unit': ['Business Unit Chair', 'Business Unit Vice Chair', 'Business Unit Committee Member'],
  'Staff-Parish Relations': ['SPR Chair', 'SPR Vice Chair', 'SPR Committee Member'],
  'Board of Trustees': ['BOT Chair', 'BOT Vice Chair', 'BOT Secretary', 'BOT Committee Member'],
  'Nominations and Leadership Development': ['Nominations and Leadership Development Committee Member', 'Nominations and Leadership Development Secretary'],
  'Connectional Ministries leadership': ['Connectional Ministries Chair', 'Connectional Ministries Vice Chair', 'Connectional Ministries Secretary'],
  'Connectional Ministries coordinators': ['Nurturing Coordinator', 'Outreach Coordinator', 'Witnessing Coordinator', 'Prayer Coordinator', "Children's Ministries Coordinator", 'Teen Ministries Coordinator'],
  'Statistics': ['Statistician', 'Statistician Vice'],
  'Preaching Point': ['Preaching Point Coordinator', 'Preaching Point Vice Coordinator', 'Preaching Point Secretary'],
  'Christian Education': ['Christian Education Chair', 'Christian Education Vice Chair', 'Class Coordinator / Teacher', 'Adult Church School Superintendent'],
  'Stewardship': ['Stewardship Chair', 'Stewardship Vice Chair', 'Stewardship Committee Member'],
  'Evangelism': ['Evangelism Chair', 'Evangelism Vice Chair', 'Evangelism Committee Member'],
  'Worship': ['Worship Chair', 'Worship Vice Chair', 'Worship Committee Member'],
  'Chief Director': ['Chief Director', 'Chief Director Committee Member'],
  'Praise in Worship': ['Praise in Worship Chair', 'Praise in Worship Vice', 'Praise in Worship Patron'],
  'Ushering': ['Head Usher', 'Head Usher Vice'],
  'Holy Communion': ['Holy Communion Chair', 'Holy Communion Vice'],
  'Education': ['Education Chair', 'Education Vice Chair', 'Education Committee Member'],
  'Teen Ministries': ['Teen Ministries Teacher', 'Teen Ministries Chair', 'Teen Ministries Vice'],
  'Family ministries': ['Family Ministries Chair', 'Couples Chair', 'Widows Chair', 'Singles Chair'],
  'Missions': ['Missions Chair', 'Missions Vice Chair', 'Missions Committee Member'],
  'Catering and Hospitality': ['Catering and Hospitality Chair', 'Catering and Hospitality Vice Chair', 'Catering and Hospitality Committee Member'],
  'Church and Society': ['Church and Society Chair', 'Church and Society Vice Chair', 'Church and Society Committee Member', 'Community Services Chair'],
  'History and Communications': ['History and Communications Chair', 'History and Communications Vice Chair', 'History and Communications Committee Member'],
  'Health and Welfare': ['Health and Welfare Chair', 'Health and Welfare Vice Chair', 'Health and Welfare Committee Member'],
  'Agriculture': ['Agriculture Chair', 'Agriculture Vice Chair', 'Agriculture Committee Member'],
  'Ministry with Women': ['Ministry with Women Chair', 'Ministry with Women Vice', 'Ministry with Women Committee Member'],
  'Prison Ministries': ['Prison Ministries Chair', 'Prison Ministries Vice', 'Prison Ministries Committee Member'],
  'Delegates': ['Delegate 1', 'Alternate Delegate 1', 'Delegate 2', 'Alternate Delegate 2'],
  'Ecumenical and religious affairs': ['Ecumenical Religious Chair', 'Ecumenical Religious Vice'],
  'Bible ministry': ['Chief Bible Reader', 'Bible Readers Committee Member'],
};
/** Organisation-scoped (UMYF, RRW, MUMC, MGSS, JSS): one definition each, applied to whichever organisation the appointment names (§7.4). */
const ORGANISATION = ['Organization Director', 'Organization Chairperson', 'Organization Vice Chairperson', 'Organization Secretary', 'Organization Treasurer', 'Organization Finance Secretary', 'Organization Projects Chair', 'Organization Hospitality Chair', 'Organization Communications Chair', 'Organization Recreation Chair', 'Organization Community Services Chair', 'Organization Committee Member'];

export const codeOf = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
/** Punctuation, case and spelling of organisation/organization must not create duplicate definitions. */
export const keyOf = (s: string) => s.toLowerCase().replace(/organisation/g, 'organization').replace(/[^a-z0-9]+/g, '');

function aliasesFor(name: string): string[] {
  const out = new Set<string>();
  if (name.includes('/')) name.split('/').forEach((p) => out.add(p.trim()));
  const vice = name.match(/^(.*) Vice$/);
  if (vice) out.add(`Vice ${vice[1]}`);
  if (name.startsWith('Organization ')) out.add(name.replace('Organization ', 'Organisation '));
  return [...out].filter((a) => keyOf(a) !== keyOf(name));
}

export const CATALOGUE = [
  ...Object.entries(GENERAL).flatMap(([groupName, names]) => names.map((name) => ({ name, groupName, scopeKind: 'CHURCH' }))),
  ...ORGANISATION.map((name) => ({ name, groupName: 'Organisation leadership', scopeKind: 'ORGANIZATION' })),
].map((p) => ({ ...p, code: codeOf(p.name), aliases: aliasesFor(p.name) }));

/** Permissions a position mapping may never carry, so no appointment (imported or approved) can mint platform or higher-scope power. */
export const FORBIDDEN_MAPPED = [/^access:/, /^circuit:register$/, /^admin:/, /^auth:/, /^hierarchy:view:all/];

const need = (user: AuthorizedUser, permission: string) => {
  if (!user.permissions.includes(permission)) throw new ForbiddenError(`Forbidden: ${permission} permission required`);
};

export class CatalogueService {
  /** Idempotent: adds missing definitions, never touches existing rows (so mappings and edits survive). */
  async ensure(churchId: string) {
    const existing = new Set((await prisma.positionDefinition.findMany({ where: { churchId }, select: { code: true } })).map((p) => p.code));
    const missing = CATALOGUE.filter((p) => !existing.has(p.code));
    if (missing.length) {
      await prisma.positionDefinition.createMany({ data: missing.map((p) => ({ churchId, code: p.code, name: p.name, groupName: p.groupName, scopeKind: p.scopeKind, aliases: p.aliases.length ? JSON.stringify(p.aliases) : null })), skipDuplicates: true });
    }
    return missing.length;
  }

  async list(user: AuthorizedUser) {
    need(user, 'leadership:position:view');
    await this.ensure(user.churchId);
    const rows = await prisma.positionDefinition.findMany({ where: { churchId: user.churchId }, orderBy: [{ groupName: 'asc' }, { name: 'asc' }] });
    return rows.map((p) => ({ id: p.id, code: p.code, name: p.name, group: p.groupName, scopeKind: p.scopeKind, allowMultiple: p.allowMultiple, active: p.active, mappedRoleId: p.mappedRoleId, grantsAccess: !!p.mappedRoleId }));
  }

  /**
   * Map a position to a permission bundle (or clear it). The role must be this church's, must not carry any forbidden
   * permission, and the person mapping it must already hold every permission in it: you cannot hand out what you lack.
   */
  async setMapping(user: AuthorizedUser, code: string, roleId: string | null) {
    need(user, 'leadership:position:manage');
    const position = await prisma.positionDefinition.findUnique({ where: { churchId_code: { churchId: user.churchId, code } } });
    if (!position) throw new NotFoundError('Position');
    if (roleId) {
      const role = await prisma.role.findUnique({ where: { id: roleId }, include: { permissions: { include: { permission: true } } } });
      if (!role || role.churchId !== user.churchId) throw new NotFoundError('Role');
      const names = role.permissions.map((p) => p.permission.name);
      const bad = names.filter((n) => FORBIDDEN_MAPPED.some((re) => re.test(n)));
      if (bad.length) throw new ValidationError(`A position cannot map to a role carrying: ${bad.join(', ')}`);
      const lacking = names.filter((n) => !user.permissions.includes(n));
      if (lacking.length) throw new ForbiddenError(`You cannot map permissions you do not hold: ${lacking.slice(0, 5).join(', ')}`);
    }
    await prisma.positionDefinition.update({ where: { id: position.id }, data: { mappedRoleId: roleId } });
    try {
      await prisma.auditLog.create({ data: { churchId: user.churchId, action: 'POSITION_MAPPING_CHANGED', entityType: 'POSITION', entityId: position.id, actorId: user.memberId ?? user.id, changes: JSON.stringify({ code, from: position.mappedRoleId, to: roleId }) } });
    } catch (error) { logger.error({ err: error }, 'Failed to audit position mapping'); }
    return { code, mappedRoleId: roleId };
  }

  /** Resolve a CSV cell to a definition by code, name or alias, ignoring punctuation and organisation/organization spelling. */
  async resolver(churchId: string) {
    await this.ensure(churchId);
    const all = await prisma.positionDefinition.findMany({ where: { churchId, active: true } });
    const byKey = new Map<string, (typeof all)[number]>();
    for (const p of all) {
      byKey.set(keyOf(p.code), p); byKey.set(keyOf(p.name), p);
      for (const a of (p.aliases ? (JSON.parse(p.aliases) as string[]) : [])) if (!byKey.has(keyOf(a))) byKey.set(keyOf(a), p);
    }
    return (cell: string) => byKey.get(keyOf(cell)) ?? null;
  }
}
export const catalogueService = new CatalogueService();
