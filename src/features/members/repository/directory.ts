import { Prisma } from '@prisma/client';
import { prisma } from '@/database';

const listSelect = {
  id: true, membershipNumber: true, firstName: true, middleName: true, lastName: true, email: true, phone: true, gender: true,
  membershipStatus: true, joinDate: true, archivedAt: true, isDependent: true, sectionId: true,
  section: { select: { name: true } },
} satisfies Prisma.MemberSelect;

export type DirectoryRow = Prisma.MemberGetPayload<{ select: typeof listSelect }>;

export class DirectoryRepository {
  async search(where: Prisma.MemberWhereInput, orderBy: Prisma.MemberOrderByWithRelationInput[], skip: number, take: number) {
    return Promise.all([prisma.member.findMany({ where, orderBy, skip, take, select: listSelect }), prisma.member.count({ where })]);
  }

  listForExport(where: Prisma.MemberWhereInput, take: number) {
    return prisma.member.findMany({
      where, take, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { ...listSelect, middleName: true, dateOfBirth: true, address: true, maritalStatus: true, membershipDate: true },
    });
  }

  listSections(churchId: string) {
    return prisma.section.findMany({ where: { churchId }, select: { id: true, name: true } });
  }

  findExisting(churchId: string, emails: string[], birthDates: Date[]) {
    return prisma.member.findMany({
      where: { churchId, OR: [...(emails.length ? [{ email: { in: emails } }] : []), ...(birthDates.length ? [{ dateOfBirth: { in: birthDates } }] : [])] },
      select: { email: true, firstName: true, lastName: true, dateOfBirth: true },
    });
  }

  createMany(data: Prisma.MemberCreateManyInput[]) {
    return prisma.member.createMany({ data });
  }

  recordImport(data: Prisma.MemberImportUncheckedCreateInput) {
    return prisma.memberImport.create({ data });
  }

  listImports(churchId: string, take: number) {
    return prisma.memberImport.findMany({ where: { churchId }, orderBy: { createdAt: 'desc' }, take });
  }

  findMember(id: string) {
    return prisma.member.findUnique({ where: { id }, select: { id: true, churchId: true, archivedAt: true } });
  }

  setArchived(id: string, archivedAt: Date | null, archivedBy: string | null) {
    return prisma.member.update({ where: { id }, data: { archivedAt, archivedBy }, select: { id: true, archivedAt: true } });
  }

  endSessionsForMember(memberId: string) {
    return prisma.session.deleteMany({ where: { user: { memberId } } });
  }
}

export const directoryRepository = new DirectoryRepository();
