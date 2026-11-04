import { Prisma } from '@prisma/client';
import { prisma } from '@/database';
import { logger } from '@/config/logger';
import { nextMembershipNumbers } from '@/features/members/service/membershipNumber';
import type { AuthorizedUser } from '@/types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/types/errors';
import { visitorRepository as repository } from '../repository';
import type { ConvertInput, CreateVisitorInput, FollowUpInput, UpdateVisitorInput, VisitorListQuery } from '../types';

type VisitorRow = NonNullable<Awaited<ReturnType<typeof repository.find>>>;

function require(user: AuthorizedUser, permission: string): void {
  if (!user.permissions.includes(permission)) throw new ForbiddenError(`Forbidden: ${permission} permission required`);
}

export class VisitorService {
  async create(user: AuthorizedUser, input: CreateVisitorInput) {
    require(user, 'visitor:create');
    if (input.assignedToId) await this.assertMember(user.churchId, input.assignedToId);
    const visitor = await repository.create({ churchId: user.churchId, ...input, visitDate: input.visitDate ?? new Date() });
    await this.audit(user, 'VISITOR_CREATED', visitor.id, {});
    return this.view({ ...visitor, followUps: [] });
  }

  async list(user: AuthorizedUser, query: VisitorListQuery) {
    require(user, 'visitor:view');
    const tokens = (query.q ?? '').split(/\s+/).filter(Boolean).slice(0, 5);
    const where: Prisma.VisitorWhereInput = {
      churchId: user.churchId,
      ...(query.status && { followUpStatus: query.status }),
      ...(query.assignedToId && { assignedToId: query.assignedToId }),
      ...(tokens.length && {
        AND: tokens.map((t) => ({ OR: [{ firstName: { contains: t } }, { lastName: { contains: t } }, { email: { contains: t } }, { phone: { contains: t } }] })),
      }),
    };
    const [[rows, total], counts] = await Promise.all([repository.list(where, (query.page - 1) * query.pageSize, query.pageSize), repository.statusCounts(user.churchId)]);
    return {
      items: rows.map((v) => this.view({ ...v, followUps: [] })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      statusCounts: Object.fromEntries(counts.map((c) => [c.followUpStatus, c._count._all])),
    };
  }

  async get(user: AuthorizedUser, id: string) {
    require(user, 'visitor:view');
    return this.view(await this.owned(user, id));
  }

  async update(user: AuthorizedUser, id: string, input: UpdateVisitorInput) {
    require(user, 'visitor:manage');
    const existing = await this.owned(user, id);
    if (existing.convertedMemberId) throw new ConflictError('This visitor has already become a member');
    if (input.assignedToId) await this.assertMember(user.churchId, input.assignedToId);
    await repository.update(id, input);
    return this.view(await this.owned(user, id));
  }

  async addFollowUp(user: AuthorizedUser, id: string, input: FollowUpInput) {
    require(user, 'visitor:manage');
    const visitor = await this.owned(user, id);
    if (visitor.convertedMemberId) throw new ConflictError('This visitor has already become a member');
    await repository.addFollowUp({ visitorId: id, churchId: user.churchId, actorId: user.id, method: input.method, notes: input.notes ?? null });
    // A first contact moves NEW along; later logs never move a visitor backwards unless the caller says so.
    const next = input.status ?? (visitor.followUpStatus === 'NEW' ? 'CONTACTED' : undefined);
    if (next) await repository.update(id, { followUpStatus: next });
    return this.view(await this.owned(user, id));
  }

  /** Turns a visitor into a member in one step, keeping the visit history attached to the visitor record. */
  async convert(user: AuthorizedUser, id: string, input: ConvertInput) {
    require(user, 'visitor:manage');
    require(user, 'member:create');
    const visitor = await this.owned(user, id);
    if (visitor.convertedMemberId) throw new ConflictError('This visitor has already become a member');
    if (input.sectionId && !(await repository.findSectionInChurch(user.churchId, input.sectionId))) throw new ValidationError('Section not found');
    if (visitor.email && (await repository.findMemberByEmail(user.churchId, visitor.email))) {
      throw new ConflictError('A member with this email already exists. Update the visitor email or link manually.');
    }

    const [membershipNumber] = await nextMembershipNumbers(1);
    const member = await prisma.$transaction(async (tx) => {
      const claimed = await tx.visitor.updateMany({ where: { id, convertedMemberId: null }, data: { followUpStatus: 'JOINED' } });
      if (claimed.count === 0) throw new ConflictError('This visitor has already become a member');
      const created = await tx.member.create({
        data: {
          churchId: user.churchId, firstName: visitor.firstName, lastName: visitor.lastName, email: visitor.email, phone: visitor.phone,
          sectionId: input.sectionId ?? null, gender: input.gender ?? null, dateOfBirth: input.dateOfBirth ?? null, membershipNumber, membershipStatus: 'ACTIVE',
        },
      });
      await tx.visitor.update({ where: { id }, data: { convertedMemberId: created.id } });
      return created;
    });
    await this.audit(user, 'VISITOR_CONVERTED', id, { memberId: member.id });
    return { visitor: this.view(await this.owned(user, id)), member: { id: member.id, membershipNumber: member.membershipNumber } };
  }

  private async assertMember(churchId: string, memberId: string) {
    if (!(await repository.findMemberInChurch(churchId, memberId))) throw new ValidationError('Assigned member not found');
  }

  private async owned(user: AuthorizedUser, id: string): Promise<VisitorRow> {
    const visitor = await repository.find(id);
    if (!visitor || visitor.churchId !== user.churchId) throw new NotFoundError('Visitor');
    return visitor;
  }

  private view(v: VisitorRow) {
    return {
      id: v.id, firstName: v.firstName, lastName: v.lastName, phone: v.phone, email: v.email, visitDate: v.visitDate, source: v.source, notes: v.notes,
      followUpStatus: v.followUpStatus, assignedToId: v.assignedToId, convertedMemberId: v.convertedMemberId, createdAt: v.createdAt,
      followUps: v.followUps.map((f) => ({ id: f.id, method: f.method, notes: f.notes, createdAt: f.createdAt })),
    };
  }

  private async audit(user: AuthorizedUser, action: string, entityId: string, details: Record<string, unknown>) {
    try {
      await prisma.auditLog.create({ data: { churchId: user.churchId, action, entityType: 'VISITOR', entityId, actorId: user.memberId ?? user.id, changes: JSON.stringify(details) } });
    } catch (error) {
      logger.error({ err: error, action }, 'Failed to write visitor audit log');
    }
  }
}

export const visitorService = new VisitorService();
