import { Prisma } from '@prisma/client';
import { prisma } from '@/database';

const yearRange = (year?: number) =>
  year === undefined
    ? undefined
    : { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };

export class MyAccountRepository {
  findProfile(memberId: string) {
    return prisma.member.findUnique({
      where: { id: memberId },
      include: {
        church: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
        family: { select: { id: true, name: true } },
      },
    });
  }

  updateProfile(memberId: string, data: Prisma.MemberUpdateInput) {
    return prisma.member.update({ where: { id: memberId }, data });
  }

  findFamilyContext(memberId: string, familyId: string | null) {
    return Promise.all([
      prisma.familyRelationship.findMany({
        where: { OR: [{ partner1Id: memberId }, { partner2Id: memberId }, { parentId: memberId }, { childId: memberId }] },
        include: {
          partner1: { select: { id: true, firstName: true, lastName: true, isDependent: true } },
          partner2: { select: { id: true, firstName: true, lastName: true, isDependent: true } },
          parent: { select: { id: true, firstName: true, lastName: true, isDependent: true } },
          child: { select: { id: true, firstName: true, lastName: true, isDependent: true } },
        },
      }),
      prisma.member.findMany({
        where: { OR: [{ parentId: memberId }, { parentMemberId: memberId }] },
        select: { id: true, firstName: true, lastName: true, isDependent: true },
        orderBy: { firstName: 'asc' },
      }),
      familyId
        ? prisma.member.findMany({
            where: { familyId, id: { not: memberId } },
            select: { id: true, firstName: true, lastName: true, isDependent: true, membershipStatus: true },
            orderBy: { firstName: 'asc' },
          })
        : Promise.resolve([]),
    ]);
  }

  /** Newest first. `take` is the cap per table so two tables can be merged and paged in memory. */
  listReceipts(memberId: string, year: number | undefined, take: number) {
    const issuedAt = yearRange(year);
    const where = { memberId, ...(issuedAt ? { issuedAt } : {}) };
    return Promise.all([
      prisma.receipt.findMany({
        where,
        orderBy: { issuedAt: 'desc' },
        take,
        include: { fund: { select: { name: true } } },
      }),
      prisma.sectionReceipt.findMany({
        where,
        orderBy: { issuedAt: 'desc' },
        take,
        include: { section: { select: { name: true } } },
      }),
      prisma.receipt.count({ where }),
      prisma.sectionReceipt.count({ where }),
    ]);
  }

  listAllReceiptsForYear(memberId: string, year: number) {
    const where = { memberId, issuedAt: yearRange(year)! };
    return Promise.all([
      prisma.receipt.findMany({
        where,
        orderBy: { issuedAt: 'asc' },
        include: { fund: { select: { name: true } } },
      }),
      prisma.sectionReceipt.findMany({
        where,
        orderBy: { issuedAt: 'asc' },
        include: { section: { select: { name: true } } },
      }),
    ]);
  }

  async listReceiptDates(memberId: string): Promise<Date[]> {
    const [church, section] = await Promise.all([
      prisma.receipt.findMany({ where: { memberId }, select: { issuedAt: true } }),
      prisma.sectionReceipt.findMany({ where: { memberId }, select: { issuedAt: true } }),
    ]);
    return [...church, ...section].map((row) => row.issuedAt);
  }

  listNotifications(recipientIds: string[], memberId: string, take: number) {
    return Promise.all([
      prisma.notification.findMany({ where: { recipientId: { in: recipientIds } }, orderBy: { createdAt: 'desc' }, take }),
      prisma.pastoralNotification.findMany({ where: { pastorId: memberId }, orderBy: { createdAt: 'desc' }, take }),
      prisma.notification.count({ where: { recipientId: { in: recipientIds } } }),
      prisma.pastoralNotification.count({ where: { pastorId: memberId } }),
      prisma.notification.count({ where: { recipientId: { in: recipientIds }, readAt: null } }),
      prisma.pastoralNotification.count({ where: { pastorId: memberId, read: false } }),
    ]);
  }

  async markNotificationRead(id: string, recipientIds: string[], memberId: string): Promise<boolean> {
    const now = new Date();
    const system = await prisma.notification.updateMany({
      where: { id, recipientId: { in: recipientIds }, readAt: null },
      data: { readAt: now },
    });
    if (system.count > 0) return true;
    const pastoral = await prisma.pastoralNotification.updateMany({
      where: { id, pastorId: memberId, read: false },
      data: { read: true, readAt: now },
    });
    if (pastoral.count > 0) return true;
    // Already read counts as success; only an id that is not theirs is "not found".
    const [system404, pastoral404] = await Promise.all([
      prisma.notification.count({ where: { id, recipientId: { in: recipientIds } } }),
      prisma.pastoralNotification.count({ where: { id, pastorId: memberId } }),
    ]);
    return system404 + pastoral404 > 0;
  }

  async markAllNotificationsRead(recipientIds: string[], memberId: string): Promise<void> {
    const now = new Date();
    await Promise.all([
      prisma.notification.updateMany({ where: { recipientId: { in: recipientIds }, readAt: null }, data: { readAt: now } }),
      prisma.pastoralNotification.updateMany({ where: { pastorId: memberId, read: false }, data: { read: true, readAt: now } }),
    ]);
  }

  findChurchName(churchId: string) {
    return prisma.church.findUnique({ where: { id: churchId }, select: { name: true } });
  }
}

export const myAccountRepository = new MyAccountRepository();
