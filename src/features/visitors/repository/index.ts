import { Prisma } from '@prisma/client';
import { prisma } from '@/database';

export class VisitorRepository {
  create(data: Prisma.VisitorUncheckedCreateInput) {
    return prisma.visitor.create({ data });
  }

  find(id: string) {
    return prisma.visitor.findUnique({ where: { id }, include: { followUps: { orderBy: { createdAt: 'desc' }, take: 100 } } });
  }

  update(id: string, data: Prisma.VisitorUncheckedUpdateInput) {
    return prisma.visitor.update({ where: { id }, data });
  }

  async list(where: Prisma.VisitorWhereInput, skip: number, take: number) {
    return Promise.all([prisma.visitor.findMany({ where, skip, take, orderBy: { visitDate: 'desc' } }), prisma.visitor.count({ where })]);
  }

  statusCounts(churchId: string) {
    return prisma.visitor.groupBy({ by: ['followUpStatus'], where: { churchId }, _count: { _all: true } });
  }

  addFollowUp(data: Prisma.VisitorFollowUpUncheckedCreateInput) {
    return prisma.visitorFollowUp.create({ data });
  }

  findMemberInChurch(churchId: string, memberId: string) {
    return prisma.member.findFirst({ where: { id: memberId, churchId, archivedAt: null }, select: { id: true } });
  }

  findSectionInChurch(churchId: string, sectionId: string) {
    return prisma.section.findFirst({ where: { id: sectionId, churchId }, select: { id: true } });
  }

  findMemberByEmail(churchId: string, email: string) {
    return prisma.member.findFirst({ where: { churchId, email }, select: { id: true } });
  }
}

export const visitorRepository = new VisitorRepository();
