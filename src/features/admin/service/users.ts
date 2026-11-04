import type { AuthorizedUser } from '@/types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/types/errors';
import { adminRepository as repository } from '../repository';
import type { UserListQuery } from '../types';
import { audit, require } from './common';
import { otherAdminsRemain } from './roles';

type UserRecord = NonNullable<Awaited<ReturnType<typeof repository.findUser>>>;

const view = (u: UserRecord) => ({
  id: u.id, email: u.email, emailVerified: u.emailVerified, createdAt: u.createdAt,
  memberId: u.memberId, name: u.member ? `${u.member.firstName} ${u.member.lastName}` : null, membershipNumber: u.member?.membershipNumber ?? null,
  twoFactorEnabled: Boolean(u.twoFactorSecret?.isEnabled),
  lastSignInAt: u.sessions[0]?.createdAt ?? null,
  disabled: u.disabledAt !== null, disabledAt: u.disabledAt, disabledReason: u.disabledReason,
  roles: (u.member?.leadershipAssignments ?? []).map((a) => ({ assignmentId: a.id, roleId: a.role.id, role: a.role.name, position: a.position, since: a.startDate })),
});

export class UserAdminService {
  async list(user: AuthorizedUser, query: UserListQuery) {
    require(user, 'admin:user:manage');
    const { items, total } = await repository.listUsers(user.churchId, query, new Date());
    return { items: items.map((u) => view(u as UserRecord)), total };
  }

  async get(user: AuthorizedUser, id: string) {
    require(user, 'admin:user:manage');
    return view(await this.find(user, id));
  }

  async disable(user: AuthorizedUser, id: string, reason: string) {
    require(user, 'admin:user:manage');
    if (id === user.id) throw new ConflictError('You cannot switch off your own account');
    const target = await this.find(user, id);
    if (target.disabledAt) throw new ConflictError('This account is already switched off');
    // If nobody else could manage users once this account is off, refuse: that would lock the church out.
    if (!(await otherAdminsRemain(user.churchId, { userId: id }))) {
      throw new ConflictError('This is the last account that can manage users. Switching it off would lock everyone out.');
    }
    if (!(await repository.disableUser(id, reason, new Date()))) throw new ConflictError('This account was changed by someone else. Reload and try again.');
    await audit(user, 'USER_DISABLED', 'USER', id, { email: target.email, reason });
    return this.get(user, id);
  }

  async enable(user: AuthorizedUser, id: string) {
    require(user, 'admin:user:manage');
    const target = await this.find(user, id);
    if (!target.disabledAt) throw new ConflictError('This account is not switched off');
    const claimed = await repository.enableUser(id);
    if (claimed.count === 0) throw new ConflictError('This account was changed by someone else. Reload and try again.');
    await audit(user, 'USER_ENABLED', 'USER', id, { email: target.email });
    return this.get(user, id);
  }

  async revokeSessions(user: AuthorizedUser, id: string) {
    require(user, 'admin:user:manage');
    const target = await this.find(user, id);
    const result = await repository.revokeSessions([id]);
    await audit(user, 'USER_SESSIONS_REVOKED', 'USER', id, { email: target.email, sessions: result.count });
    return { revoked: result.count };
  }

  /** Gives a person a role. You can only hand out roles whose powers you hold yourself. */
  async assignRole(user: AuthorizedUser, id: string, input: { roleId: string; position?: string }) {
    require(user, 'admin:user:manage');
    const target = await this.find(user, id);
    if (!target.memberId) throw new ValidationError('This account is not linked to a member, so it cannot hold a role');
    const role = await repository.findRole(user.churchId, input.roleId);
    if (!role) throw new NotFoundError('Role');
    const above = role.permissions.map((p) => p.permission.name).filter((n) => !user.permissions.includes(n));
    if (above.length) throw new ForbiddenError(`This role carries permissions you do not hold (${above.slice(0, 3).join(', ')}), so you cannot assign it`);
    if (await repository.hasActiveAssignment(user.churchId, target.memberId, role.id, new Date())) throw new ConflictError('This person already holds that role');
    const assignment = await repository.createAssignment({ churchId: user.churchId, memberId: target.memberId, roleId: role.id, position: input.position ?? null });
    await audit(user, 'USER_ROLE_ASSIGNED', 'USER', id, { role: role.name, assignmentId: assignment.id });
    return this.get(user, id);
  }

  /** Ending a role signs the person out so the permission is gone immediately, not when their token expires. */
  async removeRole(user: AuthorizedUser, id: string, assignmentId: string) {
    require(user, 'admin:user:manage');
    const target = await this.find(user, id);
    const assignment = await repository.findAssignment(user.churchId, assignmentId);
    if (!assignment || assignment.memberId !== target.memberId) throw new NotFoundError('Role assignment');
    const carriesAdmin = assignment.role.permissions.some((p) => p.permission.name === 'admin:user:manage');
    if (carriesAdmin && !(await otherAdminsRemain(user.churchId, { assignmentId }))) {
      throw new ConflictError('This is the last assignment that lets anyone manage users. Removing it would lock everyone out.');
    }
    const ended = await repository.endAssignment(assignmentId, new Date());
    if (ended.count === 0) throw new ConflictError('This role was already ended');
    await repository.revokeSessions([id]);
    await audit(user, 'USER_ROLE_REMOVED', 'USER', id, { role: assignment.role.name, assignmentId });
    return this.get(user, id);
  }

  private async find(user: AuthorizedUser, id: string): Promise<UserRecord> {
    const found = await repository.findUser(user.churchId, id, new Date());
    if (!found) throw new NotFoundError('User');
    return found as UserRecord;
  }
}

export const userAdminService = new UserAdminService();
