import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { audit, require } from '@/features/shared';
import type { AuthorizedUser } from '@/types';
import { ConflictError, NotFoundError, ValidationError } from '@/types/errors';
import { campaignRepository as repository } from '../repository';
import type { CreateCampaignInput, UpdateCampaignInput } from '../types';

const DAY = 24 * 60 * 60 * 1000;
const money = (v: Prisma.Decimal.Value) => Number(new Prisma.Decimal(v).toFixed(2));
type CampaignRow = NonNullable<Awaited<ReturnType<typeof repository.find>>>;

const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'campaign';

export class CampaignService {
  async create(user: AuthorizedUser, input: CreateCampaignInput) {
    require(user, 'campaign:manage');
    const account = await repository.churchAccount(user.churchId);
    if (!account) throw new ConflictError('Set up the church financial account before creating a campaign');
    // The random suffix keeps the public link unguessable-ish and avoids name clashes.
    const slug = `${slugify(input.name)}-${randomBytes(3).toString('hex')}`;
    try {
      const campaign = await repository.create({
        churchId: user.churchId, accountId: account.id, name: input.name, slug, description: input.description ?? null,
        goalAmount: input.goalAmount, startDate: input.startDate, endDate: input.endDate ?? null, isPublic: input.isPublic, createdBy: user.memberId ?? user.id,
      });
      await audit(user, 'CAMPAIGN_CREATED', 'CAMPAIGN', campaign.id, { name: input.name, goalAmount: input.goalAmount });
      return this.view(campaign);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictError('Please try again');
      throw error;
    }
  }

  async list(user: AuthorizedUser, query: { status?: string; skip: number; take: number }) {
    require(user, 'campaign:manage');
    const { items, total } = await repository.list(user.churchId, query);
    return { items: await Promise.all(items.map((c) => this.view(c))), total };
  }

  async get(user: AuthorizedUser, id: string) {
    require(user, 'campaign:manage');
    return this.view(await this.find(user, id));
  }

  async update(user: AuthorizedUser, id: string, input: UpdateCampaignInput) {
    require(user, 'campaign:manage');
    const campaign = await this.find(user, id);
    if (campaign.status === 'CLOSED') throw new ConflictError('A closed campaign cannot be changed');
    if (input.endDate && input.endDate <= campaign.startDate) throw new ValidationError('End date must be after the start date');
    const updated = await repository.update(id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.goalAmount !== undefined ? { goalAmount: input.goalAmount } : {}),
      ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
      ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
    });
    await audit(user, 'CAMPAIGN_UPDATED', 'CAMPAIGN', id, { changes: input });
    return this.view(updated);
  }

  async activate(user: AuthorizedUser, id: string) {
    require(user, 'campaign:manage');
    const campaign = await this.find(user, id);
    if (campaign.status !== 'DRAFT') throw new ConflictError('Only a draft campaign can be activated');
    if (!(await repository.transition(id, campaign.fundId, 'DRAFT', 'ACTIVE', true))) throw new ConflictError('This campaign was changed by someone else. Reload and try again.');
    await audit(user, 'CAMPAIGN_ACTIVATED', 'CAMPAIGN', id);
    return this.get(user, id);
  }

  /** Closing shuts the fund to new gifts. Gifts already made stay in the fund and its books. */
  async close(user: AuthorizedUser, id: string) {
    require(user, 'campaign:manage');
    const campaign = await this.find(user, id);
    if (campaign.status !== 'ACTIVE') throw new ConflictError('Only an active campaign can be closed');
    if (!(await repository.transition(id, campaign.fundId, 'ACTIVE', 'CLOSED', false))) throw new ConflictError('This campaign was changed by someone else. Reload and try again.');
    await audit(user, 'CAMPAIGN_CLOSED', 'CAMPAIGN', id);
    return this.get(user, id);
  }

  /** What the unauthenticated page may show: progress only, never who gave. */
  async publicView(slug: string, now = new Date()) {
    const campaign = await repository.findPublic(slug);
    if (!campaign) throw new NotFoundError('Campaign');
    const progress = await this.progress(campaign);
    return {
      name: campaign.name, description: campaign.description, fundId: campaign.fundId, goalAmount: money(campaign.goalAmount),
      raised: progress.raised, percent: progress.percent, donors: progress.donors,
      startDate: campaign.startDate, endDate: campaign.endDate,
      daysLeft: campaign.endDate ? Math.max(Math.ceil((campaign.endDate.getTime() - now.getTime()) / DAY), 0) : null,
    };
  }

  // ----------------------------------------------------------------------
  private async find(user: AuthorizedUser, id: string): Promise<CampaignRow> {
    const campaign = await repository.find(user.churchId, id);
    if (!campaign) throw new NotFoundError('Campaign');
    return campaign;
  }

  private async progress(c: { fundId: string; goalAmount: Prisma.Decimal.Value }) {
    const r = await repository.raised(c.fundId);
    const goal = money(c.goalAmount);
    const raised = money(r.total);
    return { raised, gifts: r.gifts, donors: r.donors, percent: goal > 0 ? Math.min(Math.round((raised / goal) * 1000) / 10, 100) : 0 };
  }

  private async view(c: CampaignRow) {
    return {
      id: c.id, name: c.name, slug: c.slug, description: c.description, status: c.status, isPublic: c.isPublic, fundId: c.fundId,
      goalAmount: money(c.goalAmount), startDate: c.startDate, endDate: c.endDate, createdAt: c.createdAt, ...(await this.progress(c)),
    };
  }
}

export const campaignService = new CampaignService();
