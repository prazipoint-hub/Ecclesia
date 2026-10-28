import { prisma } from '@/database';
import { AuthorizedUser } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { CreateCommitteeDTO, UpdateCommitteeDTO } from '../types';
import { committeeRepository } from '../repository';

export class CommitteeService {
  async list(user: AuthorizedUser) { this.require(user, 'committee:view'); return committeeRepository.list(user.churchId); }
  async create(data: CreateCommitteeDTO, user: AuthorizedUser) {
    this.require(user, 'committee:create');
    const actorId = this.actor(user);
    const existing = await prisma.committee.findFirst({ where: { churchId: user.churchId, name: data.name }, select: { id: true } });
    if (existing) throw new Error('Invalid: a committee with this name already exists');
    const committee = await committeeRepository.create({ ...data, churchId: user.churchId });
    await this.audit('COMMITTEE_CREATED', committee.id, actorId, user.churchId, { name: committee.name });
    return committee;
  }
  async update(id: string, data: UpdateCommitteeDTO, user: AuthorizedUser) {
    this.require(user, 'committee:update');
    const actorId = this.actor(user);
    if (data.name) {
      const duplicate = await prisma.committee.findFirst({ where: { churchId: user.churchId, name: data.name, NOT: { id } }, select: { id: true } });
      if (duplicate) throw new Error('Invalid: a committee with this name already exists');
    }
    const committee = await committeeRepository.update(id, user.churchId, data);
    if (!committee) throw new Error('Committee not found');
    await this.audit('COMMITTEE_UPDATED', id, actorId, user.churchId, { name: data.name });
    return committee;
  }
  private require(user: AuthorizedUser, permission: string) { if (!user.permissions.includes(permission)) throw new Error(`Forbidden: ${permission} permission required`); }
  private actor(user: AuthorizedUser) { if (!user.memberId) throw new Error('Invalid: a member-linked account is required for committee administration'); return user.memberId; }
  private async audit(action: string, entityId: string, actorId: string, churchId: string, changes: Record<string, unknown>) { await prisma.auditLog.create({ data: { id: uuidv4(), action, entityType: 'COMMITTEE', entityId, actorId, churchId, changes: JSON.stringify(changes), timestamp: new Date() } }); }
}
export const committeeService = new CommitteeService();
