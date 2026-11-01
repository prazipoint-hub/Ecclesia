import { Prisma } from '@prisma/client';
import { prisma } from '@/database';

const activeNow = (now: Date) => ({ startDate: { lte: now }, OR: [{ endDate: null }, { endDate: { gt: now } }] });
const memberSelect = { id: true, firstName: true, lastName: true, membershipNumber: true } as const;

export class AdminRepository {
  // ---- permissions + roles
  allPermissions() {
    return prisma.permission.findMany({ orderBy: { name: 'asc' } });
  }
  permissionsByNames(names: string[]) {
    return prisma.permission.findMany({ where: { name: { in: names } } });
  }
  listRoles(churchId: string) {
    return prisma.role.findMany({ where: { churchId }, include: { _count: { select: { permissions: true, assignments: true } } }, orderBy: { name: 'asc' } });
  }
  findRole(churchId: string, id: string) {
    return prisma.role.findFirst({ where: { id, churchId }, include: { permissions: { include: { permission: true } }, _count: { select: { assignments: true } } } });
  }
  createRole(churchId: string, data: { name: string; description: string | null }, permissionIds: string[]) {
    return prisma.$transaction(async (tx) => {
      const role = await tx.role.create({ data: { churchId, ...data } });
      if (permissionIds.length) await tx.rolePermission.createMany({ data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })) });
      return role;
    });
  }
  updateRole(id: string, data: Prisma.RoleUncheckedUpdateInput) {
    return prisma.role.update({ where: { id }, data });
  }
  replaceRolePermissions(roleId: string, permissionIds: string[]) {
    return prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (permissionIds.length) await tx.rolePermission.createMany({ data: permissionIds.map((permissionId) => ({ roleId, permissionId })) });
    });
  }
  deleteRole(id: string) {
    return prisma.role.delete({ where: { id } });
  }
  activeAssignmentsForRole(churchId: string, roleId: string, now: Date) {
    return prisma.leadershipAssignment.findMany({
      where: { churchId, roleId, ...activeNow(now) },
      select: { id: true, position: true, startDate: true, member: { select: memberSelect } },
      take: 200,
    });
  }
  memberUserIds(memberIds: string[]) {
    return prisma.user.findMany({ where: { memberId: { in: memberIds } }, select: { id: true } });
  }

  // ---- last-administrator guard
  /** Members who would still hold the user-admin permission through an active role, ignoring the given role or assignment. */
  adminMemberIds(churchId: string, now: Date, exclude: { roleId?: string; assignmentId?: string }) {
    return prisma.leadershipAssignment.findMany({
      where: {
        churchId,
        ...activeNow(now),
        role: { permissions: { some: { permission: { name: 'admin:user:manage' } } } },
        ...(exclude.roleId ? { roleId: { not: exclude.roleId } } : {}),
        ...(exclude.assignmentId ? { id: { not: exclude.assignmentId } } : {}),
      },
      select: { memberId: true },
    });
  }
  countEnabledUsers(churchId: string, memberIds: string[], excludeUserId?: string) {
    return prisma.user.count({ where: { churchId, memberId: { in: memberIds }, disabledAt: null, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) } });
  }

  // ---- users
  async listUsers(churchId: string, query: { q?: string; status?: string; skip: number; take: number }, now: Date) {
    const where: Prisma.UserWhereInput = {
      churchId,
      ...(query.status === 'DISABLED' ? { disabledAt: { not: null } } : query.status === 'ACTIVE' ? { disabledAt: null } : {}),
      ...(query.q
        ? { OR: [{ email: { contains: query.q } }, { member: { OR: [{ firstName: { contains: query.q } }, { lastName: { contains: query.q } }] } }] }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: this.userSelect(now),
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      prisma.user.count({ where }),
    ]);
    return { items, total };
  }
  findUser(churchId: string, id: string, now: Date) {
    return prisma.user.findFirst({ where: { id, churchId }, select: this.userSelect(now) });
  }
  private userSelect(now: Date) {
    return {
      id: true, email: true, emailVerified: true, memberId: true, createdAt: true, disabledAt: true, disabledReason: true,
      twoFactorSecret: { select: { isEnabled: true } },
      sessions: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      member: {
        select: {
          firstName: true, lastName: true, membershipNumber: true,
          leadershipAssignments: { where: activeNow(now), select: { id: true, position: true, startDate: true, role: { select: { id: true, name: true } } } },
        },
      },
    } satisfies Prisma.UserSelect;
  }
  /** Disabling is atomic: only an enabled account can be switched off, and its sessions go in the same step. */
  disableUser(id: string, reason: string, now: Date) {
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.user.updateMany({ where: { id, disabledAt: null }, data: { disabledAt: now, disabledReason: reason } });
      if (claimed.count === 0) return false;
      await tx.session.deleteMany({ where: { userId: id } });
      return true;
    });
  }
  enableUser(id: string) {
    return prisma.user.updateMany({ where: { id, disabledAt: { not: null } }, data: { disabledAt: null, disabledReason: null } });
  }
  revokeSessions(userIds: string[]) {
    return prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  }
  findAssignment(churchId: string, id: string) {
    return prisma.leadershipAssignment.findFirst({ where: { id, churchId }, include: { role: { include: { permissions: { include: { permission: true } } } } } });
  }
  hasActiveAssignment(churchId: string, memberId: string, roleId: string, now: Date) {
    return prisma.leadershipAssignment.findFirst({ where: { churchId, memberId, roleId, ...activeNow(now) }, select: { id: true } });
  }
  createAssignment(data: Prisma.LeadershipAssignmentUncheckedCreateInput) {
    return prisma.leadershipAssignment.create({ data, include: { role: { select: { id: true, name: true } } } });
  }
  endAssignment(id: string, now: Date) {
    return prisma.leadershipAssignment.updateMany({ where: { id, OR: [{ endDate: null }, { endDate: { gt: now } }] }, data: { endDate: now } });
  }

  // ---- settings
  listSettings(churchId: string) {
    return prisma.systemSetting.findMany({ where: { churchId } });
  }
  findSetting(churchId: string, key: string) {
    return prisma.systemSetting.findUnique({ where: { churchId_key: { churchId, key } } });
  }
  upsertSetting(churchId: string, key: string, value: Prisma.InputJsonValue, category: string, updatedBy: string) {
    return prisma.systemSetting.upsert({
      where: { churchId_key: { churchId, key } },
      update: { value, updatedBy },
      create: { churchId, key, value, category, updatedBy },
    });
  }
  deleteSetting(churchId: string, key: string) {
    return prisma.systemSetting.deleteMany({ where: { churchId, key } });
  }

  // ---- audit log
  async listAudit(where: Prisma.AuditLogWhereInput, skip: number, take: number) {
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { timestamp: 'desc' }, skip, take }),
      prisma.auditLog.count({ where }),
    ]);
    return { items, total };
  }
  /** Audit rows record either a member id or a user id as the actor, so both are looked up. */
  async actorNames(churchId: string, ids: string[]) {
    const [members, users] = await Promise.all([
      prisma.member.findMany({ where: { churchId, id: { in: ids } }, select: memberSelect }),
      prisma.user.findMany({ where: { churchId, id: { in: ids } }, select: { id: true, email: true, member: { select: memberSelect } } }),
    ]);
    const names = new Map<string, string>();
    for (const m of members) names.set(m.id, `${m.firstName} ${m.lastName}`);
    for (const u of users) names.set(u.id, u.member ? `${u.member.firstName} ${u.member.lastName}` : u.email);
    return names;
  }

  // ---- retention
  listRetentionRules(churchId: string) {
    return prisma.dataRetentionRule.findMany({ where: { churchId }, orderBy: { entityType: 'asc' } });
  }
  upsertRetentionRule(churchId: string, entityType: string, retentionDays: number, isActive: boolean, updatedBy: string) {
    return prisma.dataRetentionRule.upsert({
      where: { churchId_entityType: { churchId, entityType } },
      update: { retentionDays, isActive, updatedBy },
      create: { churchId, entityType, retentionDays, isActive, updatedBy },
    });
  }
  deleteRetentionRule(churchId: string, entityType: string) {
    return prisma.dataRetentionRule.deleteMany({ where: { churchId, entityType } });
  }
  recordRetentionRun(churchId: string, entityType: string, purged: number, now: Date) {
    return prisma.dataRetentionRule.updateMany({ where: { churchId, entityType }, data: { lastRunAt: now, lastPurged: purged } });
  }
  countOrDelete(entity: string, churchId: string, cutoff: Date, dryRun: boolean): Promise<number> {
    switch (entity) {
      case 'AUDIT_LOG': {
        const where = { churchId, timestamp: { lt: cutoff } };
        return dryRun ? prisma.auditLog.count({ where }) : prisma.auditLog.deleteMany({ where }).then((r) => r.count);
      }
      case 'REPORT_EXECUTION': {
        const where = { churchId, startedAt: { lt: cutoff } };
        return dryRun ? prisma.reportExecution.count({ where }) : prisma.reportExecution.deleteMany({ where }).then((r) => r.count);
      }
      case 'SESSION': {
        const where = { user: { churchId }, expiresAt: { lt: cutoff } };
        return dryRun ? prisma.session.count({ where }) : prisma.session.deleteMany({ where }).then((r) => r.count);
      }
      default: {
        const reset = { user: { churchId }, expiresAt: { lt: cutoff } };
        const verification = { user: { churchId }, expiresAt: { lt: cutoff } };
        if (dryRun) return Promise.all([prisma.passwordReset.count({ where: reset }), prisma.emailVerification.count({ where: verification })]).then(([a, b]) => a + b);
        return Promise.all([prisma.passwordReset.deleteMany({ where: reset }), prisma.emailVerification.deleteMany({ where: verification })]).then(([a, b]) => a.count + b.count);
      }
    }
  }
}

export const adminRepository = new AdminRepository();
