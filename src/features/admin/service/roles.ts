import { Prisma } from '@prisma/client';
import type { AuthorizedUser } from '@/types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/types/errors';
import { adminRepository as repository } from '../repository';
import type { CreateRoleInput, UpdateRoleInput } from '../types';
import { audit, require } from './common';

const ADMIN_PERMISSION = 'admin:user:manage';
type RoleRecord = NonNullable<Awaited<ReturnType<typeof repository.findRole>>>;

/** Whether anyone would still be able to administer users if the given role (or assignment) stopped counting. */
export async function otherAdminsRemain(churchId: string, exclude: { roleId?: string; assignmentId?: string; userId?: string }): Promise<boolean> {
  const members = [...new Set((await repository.adminMemberIds(churchId, new Date(), exclude)).map((a) => a.memberId))];
  if (members.length === 0) return false;
  return (await repository.countEnabledUsers(churchId, members, exclude.userId)) > 0;
}

export class RoleService {
  async permissions(user: AuthorizedUser) {
    require(user, 'admin:role:manage');
    const all = await repository.allPermissions();
    return all.map((p) => ({ name: p.name, description: p.description, area: p.name.split(':')[0], grantable: user.permissions.includes(p.name) }));
  }

  async list(user: AuthorizedUser) {
    require(user, 'admin:role:manage');
    return (await repository.listRoles(user.churchId)).map((r) => ({
      id: r.id, name: r.name, description: r.description, permissionCount: r._count.permissions, assignmentCount: r._count.assignments,
    }));
  }

  async get(user: AuthorizedUser, id: string) {
    require(user, 'admin:role:manage');
    const role = await this.find(user, id);
    const assignees = await repository.activeAssignmentsForRole(user.churchId, id, new Date());
    return { ...this.view(role, user), assignees };
  }

  async create(user: AuthorizedUser, input: CreateRoleInput) {
    require(user, 'admin:role:manage');
    const permissionIds = await this.resolveGrantable(user, input.permissions);
    try {
      const role = await repository.createRole(user.churchId, { name: input.name, description: input.description ?? null }, permissionIds);
      await audit(user, 'ROLE_CREATED', 'ROLE', role.id, { name: role.name, permissions: input.permissions });
      return this.get(user, role.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictError('A role with that name already exists');
      throw error;
    }
  }

  async update(user: AuthorizedUser, id: string, input: UpdateRoleInput) {
    require(user, 'admin:role:manage');
    const role = await this.find(user, id);
    this.assertWithinOwnPower(user, role);
    try {
      await repository.updateRole(id, { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.description !== undefined ? { description: input.description } : {}) });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictError('A role with that name already exists');
      throw error;
    }
    await audit(user, 'ROLE_UPDATED', 'ROLE', id, { before: { name: role.name, description: role.description }, after: input });
    return this.get(user, id);
  }

  /**
   * Replaces the whole permission set. You can only hand out permissions you hold yourself, and you cannot touch a
   * role that already carries powers above yours. People who lose a permission are signed out so it takes effect at once.
   */
  async setPermissions(user: AuthorizedUser, id: string, names: string[]) {
    require(user, 'admin:role:manage');
    const role = await this.find(user, id);
    this.assertWithinOwnPower(user, role);
    const permissionIds = await this.resolveGrantable(user, names);

    const before = new Set(role.permissions.map((p) => p.permission.name));
    const after = new Set(names);
    const removed = [...before].filter((n) => !after.has(n));
    const added = [...after].filter((n) => !before.has(n));
    if (removed.length === 0 && added.length === 0) return this.get(user, id);

    if (removed.includes(ADMIN_PERMISSION) && !(await otherAdminsRemain(user.churchId, { roleId: id }))) {
      throw new ConflictError('This is the only role that lets anyone manage users. Removing it would lock everyone out.');
    }
    await repository.replaceRolePermissions(id, permissionIds);
    if (removed.length) await this.signOutHolders(user, id);
    await audit(user, 'ROLE_PERMISSIONS_CHANGED', 'ROLE', id, { added, removed });
    return this.get(user, id);
  }

  /** A role with any assignment, past or present, stays: deleting it would erase that leadership history. */
  async remove(user: AuthorizedUser, id: string) {
    require(user, 'admin:role:manage');
    const role = await this.find(user, id);
    this.assertWithinOwnPower(user, role);
    if (role._count.assignments > 0) throw new ConflictError('This role has been assigned to people, so it is kept for the record. Remove its permissions or rename it instead.');
    if (role.permissions.some((p) => p.permission.name === ADMIN_PERMISSION) && !(await otherAdminsRemain(user.churchId, { roleId: id }))) {
      throw new ConflictError('This is the only role that lets anyone manage users.');
    }
    await repository.deleteRole(id);
    await audit(user, 'ROLE_DELETED', 'ROLE', id, { name: role.name });
    return { deleted: true };
  }

  // ----------------------------------------------------------------------

  private async find(user: AuthorizedUser, id: string): Promise<RoleRecord> {
    const role = await repository.findRole(user.churchId, id);
    if (!role) throw new NotFoundError('Role');
    return role;
  }

  private view(role: RoleRecord, user: AuthorizedUser) {
    const names = role.permissions.map((p) => p.permission.name).sort();
    return {
      id: role.id, name: role.name, description: role.description, permissions: names, assignmentCount: role._count.assignments,
      editable: names.every((n) => user.permissions.includes(n)),
    };
  }

  private assertWithinOwnPower(user: AuthorizedUser, role: RoleRecord): void {
    const above = role.permissions.map((p) => p.permission.name).filter((n) => !user.permissions.includes(n));
    if (above.length) throw new ForbiddenError(`This role carries permissions you do not hold (${above.slice(0, 3).join(', ')}${above.length > 3 ? ', ...' : ''}), so you cannot change it`);
  }

  private async resolveGrantable(user: AuthorizedUser, names: string[]): Promise<string[]> {
    const unique = [...new Set(names)];
    if (unique.length === 0) return [];
    const found = await repository.permissionsByNames(unique);
    const missing = unique.filter((n) => !found.some((p) => p.name === n));
    if (missing.length) throw new ValidationError(`Unknown permissions: ${missing.join(', ')}`);
    const above = unique.filter((n) => !user.permissions.includes(n));
    if (above.length) throw new ForbiddenError(`You cannot grant permissions you do not hold: ${above.join(', ')}`);
    return found.map((p) => p.id);
  }

  private async signOutHolders(user: AuthorizedUser, roleId: string): Promise<void> {
    const assignments = await repository.activeAssignmentsForRole(user.churchId, roleId, new Date());
    const users = await repository.memberUserIds(assignments.map((a) => a.member.id));
    if (users.length) await repository.revokeSessions(users.map((u) => u.id));
  }
}

export const roleService = new RoleService();
