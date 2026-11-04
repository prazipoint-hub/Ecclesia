import { Prisma } from '@prisma/client';
import { logger } from '@/config/logger';
import { prisma } from '@/database';
import type { AuthorizedUser } from '@/types';
import { ConflictError, NotFoundError } from '@/types/errors';
import { accountingRepository as repository } from '../repository';
import type { CreateFundInput, UpdateFundInput } from '../types';
import { require } from './ledger';
import { D, toNumber } from './money';

export class FundService {
  /** Balance is income minus approved/paid spending, the same rule the finance dashboard uses. */
  async list(user: AuthorizedUser) {
    require(user, 'finance:view');
    return this.balances(user.churchId);
  }

  private async balances(churchId: string) {
    const [funds, { income, spend }] = await Promise.all([repository.listFunds(churchId), repository.fundIncomeAndSpend(churchId)]);
    const received = new Map(income.map((i) => [i.fundId, i._sum.amount]));
    const spent = new Map(spend.map((s) => [s.fundId, s._sum.amount]));
    return funds.map((f) => ({
      id: f.id, name: f.name, description: f.description, isActive: f.isActive, isRestricted: f.isRestricted,
      totalReceived: toNumber(received.get(f.id) ?? 0), totalSpent: toNumber(spent.get(f.id) ?? 0),
      balance: toNumber(D(received.get(f.id) ?? 0).minus(spent.get(f.id) ?? 0)),
    }));
  }

  async create(user: AuthorizedUser, input: CreateFundInput) {
    require(user, 'finance:fund:manage');
    const account = (await repository.findFinanceAccount(user.churchId)) ?? (await repository.createFinanceAccount(user.churchId));
    try {
      const fund = await repository.createFund({ churchId: user.churchId, accountId: account.id, name: input.name, description: input.description ?? null, isRestricted: input.isRestricted });
      await this.audit(user, 'FUND_CREATED', fund.id, { name: fund.name, isRestricted: fund.isRestricted });
      return fund;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictError('A fund with that name already exists');
      throw error;
    }
  }

  async update(user: AuthorizedUser, id: string, input: UpdateFundInput) {
    require(user, 'finance:fund:manage');
    const fund = await repository.findFund(id);
    if (!fund || fund.churchId !== user.churchId) throw new NotFoundError('Fund');
    if (input.isActive === false && fund.isActive) {
      const current = (await this.balances(user.churchId)).find((f) => f.id === id);
      if (current && current.balance !== 0) throw new ConflictError(`This fund still holds ${current.balance.toFixed(2)}. Spend or transfer it before deactivating.`);
    }
    try {
      const updated = await repository.updateFund(id, input);
      await this.audit(user, 'FUND_UPDATED', id, input);
      return updated;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictError('A fund with that name already exists');
      throw error;
    }
  }

  /** A receipt is never deleted; voiding keeps it on record and the ledger sync reverses its journal entry. */
  async voidReceipt(user: AuthorizedUser, receiptId: string, reason: string) {
    require(user, 'finance:journal:reverse');
    const receipt = await repository.findReceipt(receiptId);
    if (!receipt || receipt.churchId !== user.churchId) throw new NotFoundError('Receipt');
    if (receipt.status !== 'ISSUED') throw new ConflictError(`This receipt is already ${receipt.status.toLowerCase()}`);
    if (await repository.findPaymentForReceipt(receiptId)) {
      throw new ConflictError('This receipt came from an online payment. Money received through the gateway cannot be voided here.');
    }
    if (!(await repository.voidReceipt(receiptId))) throw new ConflictError('This receipt was already changed');
    await this.audit(user, 'RECEIPT_VOIDED', receiptId, { receiptNumber: receipt.receiptNumber, amount: receipt.amount.toString(), reason });
    return { id: receiptId, status: 'VOIDED' as const };
  }

  private async audit(user: AuthorizedUser, action: string, entityId: string, details: Record<string, unknown>) {
    try {
      await prisma.auditLog.create({ data: { churchId: user.churchId, action, entityType: 'FINANCE', entityId, actorId: user.memberId ?? user.id, changes: JSON.stringify(details) } });
    } catch (error) {
      logger.error({ err: error, action }, 'Failed to write finance audit log');
    }
  }
}

export const fundService = new FundService();
