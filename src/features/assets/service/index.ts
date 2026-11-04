import { Prisma } from '@prisma/client';
import { audit, require } from '@/features/shared';
import type { AuthorizedUser } from '@/types';
import { ConflictError, NotFoundError } from '@/types/errors';
import { assetRepository as repository } from '../repository';
import type { AssetListQuery, CreateAssetInput, RecordMaintenanceInput, UpdateAssetInput } from '../types';

const DAY = 24 * 60 * 60 * 1000;
const money = (v: Prisma.Decimal.Value | null) => (v === null ? null : Number(new Prisma.Decimal(v).toFixed(2)));
type AssetRow = NonNullable<Awaited<ReturnType<typeof repository.find>>>;

const isP2002 = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

const view = (a: AssetRow) => ({
  id: a.id, tag: a.tag, name: a.name, category: { id: a.category.id, name: a.category.name }, location: a.location, status: a.status,
  purchaseDate: a.purchaseDate, purchaseCost: money(a.purchaseCost), serialNumber: a.serialNumber, notes: a.notes, retiredAt: a.retiredAt,
  maintenance: a.maintenance.map((m) => ({ id: m.id, performedOn: m.performedOn, description: m.description, cost: money(m.cost), nextDueDate: m.nextDueDate })),
});

export class AssetService {
  async categories(user: AuthorizedUser) {
    require(user, 'asset:view');
    return (await repository.categories(user.churchId)).map((c) => ({ id: c.id, name: c.name, assetCount: c._count.assets }));
  }

  async createCategory(user: AuthorizedUser, name: string) {
    require(user, 'asset:manage');
    try {
      const c = await repository.createCategory(user.churchId, name);
      await audit(user, 'ASSET_CATEGORY_CREATED', 'ASSET_CATEGORY', c.id, { name });
      return { id: c.id, name: c.name, assetCount: 0 };
    } catch (e) {
      if (isP2002(e)) throw new ConflictError('That category already exists');
      throw e;
    }
  }

  async list(user: AuthorizedUser, query: AssetListQuery) {
    require(user, 'asset:view');
    const { items, total } = await repository.list(user.churchId, query);
    return {
      items: items.map((a) => ({ id: a.id, tag: a.tag, name: a.name, category: a.category.name, location: a.location, status: a.status })),
      total,
    };
  }

  async get(user: AuthorizedUser, id: string) {
    require(user, 'asset:view');
    return view(await this.find(user, id));
  }

  async create(user: AuthorizedUser, input: CreateAssetInput) {
    require(user, 'asset:manage');
    if (!(await repository.findCategory(user.churchId, input.categoryId))) throw new NotFoundError('Category');
    try {
      const a = await repository.create({
        churchId: user.churchId, categoryId: input.categoryId, tag: input.tag, name: input.name, location: input.location ?? null,
        purchaseDate: input.purchaseDate ?? null, purchaseCost: input.purchaseCost ?? null, serialNumber: input.serialNumber ?? null, notes: input.notes ?? null,
      });
      await audit(user, 'ASSET_CREATED', 'ASSET', a.id, { tag: input.tag, name: input.name });
      return view(await this.find(user, a.id));
    } catch (e) {
      if (isP2002(e)) throw new ConflictError('An asset with that tag already exists');
      throw e;
    }
  }

  async update(user: AuthorizedUser, id: string, input: UpdateAssetInput) {
    require(user, 'asset:manage');
    const asset = await this.find(user, id);
    this.assertInService(asset);
    if (input.categoryId && !(await repository.findCategory(user.churchId, input.categoryId))) throw new NotFoundError('Category');
    await repository.update(id, input);
    await audit(user, 'ASSET_UPDATED', 'ASSET', id, { changes: input });
    return view(await this.find(user, id));
  }

  async retire(user: AuthorizedUser, id: string) {
    require(user, 'asset:manage');
    await this.find(user, id);
    const claimed = await repository.retire(user.churchId, id, new Date());
    if (claimed.count === 0) throw new ConflictError('This asset is already retired');
    await audit(user, 'ASSET_RETIRED', 'ASSET', id);
    return view(await this.find(user, id));
  }

  async recordMaintenance(user: AuthorizedUser, id: string, input: RecordMaintenanceInput) {
    require(user, 'asset:manage');
    const asset = await this.find(user, id);
    this.assertInService(asset);
    const m = await repository.addMaintenance({ assetId: id, performedOn: input.performedOn, description: input.description, cost: input.cost ?? null, nextDueDate: input.nextDueDate ?? null, recordedBy: user.memberId ?? user.id });
    await audit(user, 'ASSET_MAINTENANCE_RECORDED', 'ASSET', id, { maintenanceId: m.id, cost: input.cost ?? null });
    return view(await this.find(user, id));
  }

  /**
   * Maintenance that is due or overdue. Only an asset's most recent scheduled date counts: once newer work is
   * recorded, the older reminder is considered done.
   */
  async due(user: AuthorizedUser, days: number, now = new Date()) {
    require(user, 'asset:view');
    const until = new Date(now.getTime() + days * DAY);
    const candidates = await repository.dueMaintenance(user.churchId, until);
    if (candidates.length === 0) return [];
    const latest = new Map<string, Date>();
    for (const m of await repository.latestMaintenance([...new Set(candidates.map((c) => c.assetId))])) if (!latest.has(m.assetId)) latest.set(m.assetId, m.performedOn);
    return candidates
      .filter((c) => c.performedOn.getTime() >= (latest.get(c.assetId)?.getTime() ?? 0))
      .map((c) => ({ assetId: c.asset.id, tag: c.asset.tag, name: c.asset.name, location: c.asset.location, dueDate: c.nextDueDate!, overdue: c.nextDueDate! < now, lastWork: c.description }));
  }

  private async find(user: AuthorizedUser, id: string): Promise<AssetRow> {
    const a = await repository.find(user.churchId, id);
    if (!a) throw new NotFoundError('Asset');
    return a;
  }
  private assertInService(a: AssetRow) {
    if (a.status === 'RETIRED') throw new ConflictError('A retired asset cannot be changed');
  }
}

export const assetService = new AssetService();
