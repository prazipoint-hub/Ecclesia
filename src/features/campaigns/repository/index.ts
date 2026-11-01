import { Prisma } from '@prisma/client';
import { prisma } from '@/database';

export class CampaignRepository {
  churchAccount(churchId: string) {
    return prisma.financialAccount.findUnique({ where: { churchId }, select: { id: true } });
  }
  create(data: { churchId: string; accountId: string; name: string; slug: string; description: string | null; goalAmount: number; startDate: Date; endDate: Date | null; isPublic: boolean; createdBy: string }) {
    // The fund stays closed to gifts until the campaign is activated.
    return prisma.$transaction(async (tx) => {
      const fund = await tx.fund.create({
        data: { churchId: data.churchId, accountId: data.accountId, name: `Campaign: ${data.name}`.slice(0, 190), description: data.description, isActive: false, isRestricted: true },
      });
      return tx.campaign.create({
        data: { churchId: data.churchId, fundId: fund.id, name: data.name, slug: data.slug, description: data.description, goalAmount: data.goalAmount, startDate: data.startDate, endDate: data.endDate, isPublic: data.isPublic, createdBy: data.createdBy },
      });
    });
  }
  find(churchId: string, id: string) {
    return prisma.campaign.findFirst({ where: { id, churchId } });
  }
  findPublic(slug: string) {
    return prisma.campaign.findFirst({ where: { slug, isPublic: true, status: 'ACTIVE' } });
  }
  async list(churchId: string, query: { status?: string; skip: number; take: number }) {
    const where: Prisma.CampaignWhereInput = { churchId, ...(query.status ? { status: query.status } : {}) };
    const [items, total] = await Promise.all([
      prisma.campaign.findMany({ where, orderBy: { createdAt: 'desc' }, skip: query.skip, take: query.take }),
      prisma.campaign.count({ where }),
    ]);
    return { items, total };
  }
  update(id: string, data: Prisma.CampaignUncheckedUpdateInput) {
    return prisma.campaign.update({ where: { id }, data });
  }
  /** Moves between states atomically: only a campaign still in `from` can be claimed, and its fund opens or closes in the same step. */
  transition(id: string, fundId: string, from: string, to: string, fundActive: boolean) {
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.campaign.updateMany({ where: { id, status: from }, data: { status: to } });
      if (claimed.count === 0) return false;
      await tx.fund.update({ where: { id: fundId }, data: { isActive: fundActive } });
      return true;
    });
  }
  async raised(fundId: string) {
    const [sum, donors] = await Promise.all([
      prisma.payment.aggregate({ where: { fundId, status: 'COMPLETED' }, _sum: { amount: true }, _count: true }),
      prisma.payment.groupBy({ by: ['memberId'], where: { fundId, status: 'COMPLETED' } }),
    ]);
    return { total: sum._sum.amount ?? new Prisma.Decimal(0), gifts: sum._count, donors: donors.length };
  }
}

export const campaignRepository = new CampaignRepository();
