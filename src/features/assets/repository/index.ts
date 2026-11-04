import { Prisma } from '@prisma/client';
import { prisma } from '@/database';

export class AssetRepository {
  categories(churchId: string) {
    return prisma.assetCategory.findMany({ where: { churchId }, orderBy: { name: 'asc' }, include: { _count: { select: { assets: true } } } });
  }
  createCategory(churchId: string, name: string) {
    return prisma.assetCategory.create({ data: { churchId, name } });
  }
  findCategory(churchId: string, id: string) {
    return prisma.assetCategory.findFirst({ where: { id, churchId } });
  }
  async list(churchId: string, q: { q?: string; status?: string; categoryId?: string; skip: number; take: number }) {
    const where: Prisma.AssetWhereInput = {
      churchId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q } }, { tag: { contains: q.q } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.asset.findMany({ where, include: { category: true }, orderBy: { tag: 'asc' }, skip: q.skip, take: q.take }),
      prisma.asset.count({ where }),
    ]);
    return { items, total };
  }
  find(churchId: string, id: string) {
    return prisma.asset.findFirst({ where: { id, churchId }, include: { category: true, maintenance: { orderBy: { performedOn: 'desc' }, take: 50 } } });
  }
  create(data: Prisma.AssetUncheckedCreateInput) {
    return prisma.asset.create({ data });
  }
  update(id: string, data: Prisma.AssetUncheckedUpdateInput) {
    return prisma.asset.update({ where: { id }, data });
  }
  /** Only an asset that is not already retired can be retired. */
  retire(churchId: string, id: string, now: Date) {
    return prisma.asset.updateMany({ where: { id, churchId, status: { not: 'RETIRED' } }, data: { status: 'RETIRED', retiredAt: now } });
  }
  addMaintenance(data: Prisma.AssetMaintenanceUncheckedCreateInput) {
    return prisma.assetMaintenance.create({ data });
  }
  /** Latest maintenance row per asset that has a due date, for assets still in service. */
  dueMaintenance(churchId: string, until: Date) {
    return prisma.assetMaintenance.findMany({
      where: { nextDueDate: { lte: until }, asset: { churchId, status: { not: 'RETIRED' } } },
      include: { asset: { select: { id: true, tag: true, name: true, location: true } } },
      orderBy: { nextDueDate: 'asc' },
      take: 500,
    });
  }
  latestMaintenance(assetIds: string[]) {
    return prisma.assetMaintenance.findMany({ where: { assetId: { in: assetIds } }, orderBy: { performedOn: 'desc' }, select: { assetId: true, nextDueDate: true, performedOn: true } });
  }
}

export const assetRepository = new AssetRepository();
