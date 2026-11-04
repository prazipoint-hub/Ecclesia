import { Prisma } from '@prisma/client';
import { prisma } from '@/database';

export class DocumentRepository {
  templates(churchId: string, type?: string) {
    return prisma.documentTemplate.findMany({ where: { churchId, ...(type ? { type } : {}) }, orderBy: { name: 'asc' } });
  }
  findTemplate(churchId: string, id: string) {
    return prisma.documentTemplate.findFirst({ where: { id, churchId } });
  }
  createTemplate(data: Prisma.DocumentTemplateUncheckedCreateInput) {
    return prisma.documentTemplate.create({ data });
  }
  updateTemplate(id: string, data: Prisma.DocumentTemplateUncheckedUpdateInput) {
    return prisma.documentTemplate.update({ where: { id }, data });
  }
  church(churchId: string) {
    return prisma.church.findUnique({ where: { id: churchId }, select: { name: true } });
  }
  member(churchId: string, id: string) {
    return prisma.member.findFirst({ where: { id, churchId }, select: { id: true, firstName: true, lastName: true, membershipNumber: true, archivedAt: true } });
  }
  create(data: Prisma.GeneratedDocumentUncheckedCreateInput) {
    return prisma.generatedDocument.create({ data });
  }
  find(churchId: string, id: string) {
    return prisma.generatedDocument.findFirst({ where: { id, churchId }, include: { member: { select: { firstName: true, lastName: true } } } });
  }
  async list(churchId: string, q: { type?: string; memberId?: string; skip: number; take: number }) {
    const where: Prisma.GeneratedDocumentWhereInput = { churchId, ...(q.type ? { type: q.type } : {}), ...(q.memberId ? { memberId: q.memberId } : {}) };
    const [items, total] = await Promise.all([
      prisma.generatedDocument.findMany({ where, orderBy: { createdAt: 'desc' }, skip: q.skip, take: q.take, select: { id: true, type: true, serial: true, title: true, memberId: true, voidedAt: true, createdAt: true } }),
      prisma.generatedDocument.count({ where }),
    ]);
    return { items, total };
  }
  /** Only a document that is still valid can be voided. */
  void(churchId: string, id: string, reason: string, now: Date) {
    return prisma.generatedDocument.updateMany({ where: { id, churchId, voidedAt: null }, data: { voidedAt: now, voidReason: reason } });
  }
}

export const documentRepository = new DocumentRepository();
