import { Prisma } from '@prisma/client';
import { logger } from '@/config/logger';
import { prisma } from '@/database';
import type { AuthorizedUser } from '@/types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/types/errors';
import { accountingRepository as repository } from '../repository';
import type { CreateBudgetInput, UpdateBudgetInput } from '../types';
import { require } from './ledger';
import { D, endOfDay, naturalBalance, startOfDay, toNumber } from './money';

type Item = CreateBudgetInput['items'][number];

export class BudgetService {
  async list(user: AuthorizedUser) {
    require(user, 'finance:view');
    return (await repository.listBudgets(user.churchId)).map((b) => ({
      id: b.id, name: b.name, fiscalYear: b.fiscalYear, status: b.status, itemCount: b._count.items, approvedAt: b.approvedAt,
    }));
  }

  async get(user: AuthorizedUser, id: string) {
    require(user, 'finance:view');
    return this.load(user, id);
  }

  async create(user: AuthorizedUser, input: CreateBudgetInput) {
    require(user, 'finance:budget:create');
    await this.validateItems(user.churchId, input.items);
    try {
      const budget = await repository.createBudget(
        { churchId: user.churchId, name: input.name, fiscalYear: input.fiscalYear, createdBy: user.id },
        input.items.map((i) => ({ accountId: i.accountId, fundId: i.fundId ?? null, amount: D(i.amount) }))
      );
      await this.audit(user, 'BUDGET_CREATED', budget.id, { name: input.name, fiscalYear: input.fiscalYear });
      return this.load(user, budget.id);
    } catch (error) {
      throw this.duplicateName(error);
    }
  }

  async update(user: AuthorizedUser, id: string, input: UpdateBudgetInput) {
    require(user, 'finance:budget:create');
    const budget = await this.owned(user, id);
    if (budget.status !== 'DRAFT') throw new ConflictError('Only draft budgets can be edited');
    if (input.items) await this.validateItems(user.churchId, input.items);
    try {
      const ok = await repository.replaceBudget(
        id,
        { ...(input.name !== undefined && { name: input.name }), ...(input.fiscalYear !== undefined && { fiscalYear: input.fiscalYear }) },
        input.items?.map((i) => ({ accountId: i.accountId, fundId: i.fundId ?? null, amount: D(i.amount) }))
      );
      if (!ok) throw new ConflictError('This budget is no longer a draft');
    } catch (error) {
      throw this.duplicateName(error);
    }
    return this.load(user, id);
  }

  async approve(user: AuthorizedUser, id: string) {
    require(user, 'finance:budget:approve');
    const budget = await this.owned(user, id);
    if (budget.status !== 'DRAFT') throw new ConflictError(`This budget is already ${budget.status.toLowerCase()}`);
    if (budget.createdBy === user.id) throw new ForbiddenError('Forbidden: a different person must approve a budget you prepared');
    if (await repository.findApprovedBudget(user.churchId, budget.fiscalYear)) throw new ConflictError(`Another budget is already approved for ${budget.fiscalYear}. Close it first.`);
    if (!(await repository.transitionBudget(id, 'DRAFT', { status: 'APPROVED', approvedBy: user.id, approvedAt: new Date() }))) throw new ConflictError('This budget is no longer a draft');
    await this.audit(user, 'BUDGET_APPROVED', id, { fiscalYear: budget.fiscalYear });
    return this.load(user, id);
  }

  async close(user: AuthorizedUser, id: string) {
    require(user, 'finance:budget:approve');
    const budget = await this.owned(user, id);
    if (!(await repository.transitionBudget(id, 'APPROVED', { status: 'CLOSED' }))) throw new ConflictError(`Only an approved budget can be closed; this one is ${budget.status.toLowerCase()}`);
    await this.audit(user, 'BUDGET_CLOSED', id, {});
    return this.load(user, id);
  }

  /** Budget against what the posted ledger says actually happened in the fiscal year (calendar year, UTC). */
  async versusActual(user: AuthorizedUser, id: string) {
    require(user, 'finance:view');
    const budget = await this.owned(user, id);
    const from = startOfDay(new Date(Date.UTC(budget.fiscalYear, 0, 1)));
    const to = endOfDay(new Date(Date.UTC(budget.fiscalYear, 11, 31)));
    const sums = await repository.sumsByAccountAndFund(user.churchId, from, to);

    const items = budget.items.map((item) => {
      const relevant = sums.filter((s) => s.accountId === item.accountId && (item.fundId ? s.fundId === item.fundId : true));
      const debit = relevant.reduce((sum, s) => sum.plus(s._sum.debit ?? 0), D(0));
      const credit = relevant.reduce((sum, s) => sum.plus(s._sum.credit ?? 0), D(0));
      const actual = naturalBalance(item.account.type, debit, credit);
      const planned = D(item.amount);
      return {
        id: item.id, accountId: item.accountId, accountCode: item.account.code, accountName: item.account.name, type: item.account.type, fundId: item.fundId,
        budgeted: toNumber(planned), actual: toNumber(actual),
        // Positive variance is good news: more income than planned, or less spent than planned.
        variance: toNumber(item.account.type === 'REVENUE' ? actual.minus(planned) : planned.minus(actual)),
        percentUsed: planned.isZero() ? 0 : Number(actual.div(planned).times(100).toFixed(1)),
      };
    });
    const total = (type: string, field: 'budgeted' | 'actual') => items.filter((i) => i.type === type).reduce((sum, i) => sum.plus(i[field]), D(0));
    return {
      budget: { id: budget.id, name: budget.name, fiscalYear: budget.fiscalYear, status: budget.status },
      items,
      totals: {
        revenueBudgeted: toNumber(total('REVENUE', 'budgeted')), revenueActual: toNumber(total('REVENUE', 'actual')),
        expenseBudgeted: toNumber(total('EXPENSE', 'budgeted')), expenseActual: toNumber(total('EXPENSE', 'actual')),
        surplusBudgeted: toNumber(total('REVENUE', 'budgeted').minus(total('EXPENSE', 'budgeted'))),
        surplusActual: toNumber(total('REVENUE', 'actual').minus(total('EXPENSE', 'actual'))),
      },
    };
  }

  private async validateItems(churchId: string, items: Item[]) {
    const accounts = await repository.findAccountsByIds(churchId, [...new Set(items.map((i) => i.accountId))]);
    const byId = new Map(accounts.map((a) => [a.id, a]));
    for (const item of items) {
      const account = byId.get(item.accountId);
      if (!account) throw new ValidationError('One or more budget accounts do not exist');
      if (!account.isActive) throw new ValidationError(`Account ${account.code} ${account.name} is inactive`);
      if (account.type !== 'REVENUE' && account.type !== 'EXPENSE') throw new ValidationError(`${account.code} ${account.name} is not an income or expense account`);
    }
    const seen = new Set<string>();
    const withFund = new Set<string>();
    const withoutFund = new Set<string>();
    for (const item of items) {
      const key = `${item.accountId}|${item.fundId ?? ''}`;
      if (seen.has(key)) throw new ValidationError('The same account (and fund) appears twice in the budget');
      seen.add(key);
      (item.fundId ? withFund : withoutFund).add(item.accountId);
    }
    for (const accountId of withFund) {
      if (withoutFund.has(accountId)) throw new ValidationError('An account cannot be budgeted both overall and for a specific fund');
    }
    const fundIds = [...new Set(items.map((i) => i.fundId).filter((f): f is string => !!f))];
    if (fundIds.length && (await repository.findFundsInChurch(churchId, fundIds)).length !== fundIds.length) throw new ValidationError('One or more funds do not exist');
  }

  private duplicateName(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return new ConflictError('A budget with that name already exists for that year');
    return error;
  }

  private async load(user: AuthorizedUser, id: string) {
    return this.view(await this.owned(user, id));
  }

  private async owned(user: AuthorizedUser, id: string) {
    const budget = await repository.findBudget(id);
    if (!budget || budget.churchId !== user.churchId) throw new NotFoundError('Budget');
    return budget;
  }

  private view(b: NonNullable<Awaited<ReturnType<typeof repository.findBudget>>>) {
    return {
      id: b.id, name: b.name, fiscalYear: b.fiscalYear, status: b.status, createdBy: b.createdBy, approvedBy: b.approvedBy, approvedAt: b.approvedAt,
      items: b.items.map((i) => ({ id: i.id, accountId: i.accountId, accountCode: i.account.code, accountName: i.account.name, type: i.account.type, fundId: i.fundId, amount: toNumber(i.amount) })),
    };
  }

  private async audit(user: AuthorizedUser, action: string, entityId: string, details: Record<string, unknown>) {
    try {
      await prisma.auditLog.create({ data: { churchId: user.churchId, action, entityType: 'BUDGET', entityId, actorId: user.memberId ?? user.id, changes: JSON.stringify(details) } });
    } catch (error) {
      logger.error({ err: error, action }, 'Failed to write budget audit log');
    }
  }
}

export const budgetService = new BudgetService();
