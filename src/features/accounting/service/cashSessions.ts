import { logger } from '@/config/logger';
import { prisma } from '@/database';
import type { AuthorizedUser } from '@/types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/types/errors';
import { accountingRepository as repository } from '../repository';
import type { CloseCashSessionInput } from '../types';
import { require } from './ledger';
import { D, toNumber } from './money';

type Session = NonNullable<Awaited<ReturnType<typeof repository.findCashSession>>>;

export class CashSessionService {
  async open(user: AuthorizedUser, openingBalance: number) {
    require(user, 'finance:cash_session:manage');
    if (!user.memberId) throw new ForbiddenError('Forbidden: a member-linked account is required to handle cash');
    if (await repository.findOpenCashSession(user.churchId)) throw new ConflictError('A cash session is already open. Close it before opening another.');
    const account = (await repository.findFinanceAccount(user.churchId)) ?? (await repository.createFinanceAccount(user.churchId));
    const session = await repository.createCashSession({ churchId: user.churchId, accountId: account.id, openingBalance: D(openingBalance), handledBy: user.memberId, status: 'OPEN' });
    await this.audit(user, 'CASH_SESSION_OPENED', session.id, { openingBalance });
    return this.view(session);
  }

  /**
   * Expected cash = opening float + cash receipts recorded since the session opened - cash paid out.
   * Anything that does not add up must be explained in the notes, so a shortfall is never silent.
   */
  async close(user: AuthorizedUser, id: string, input: CloseCashSessionInput) {
    require(user, 'finance:cash_session:manage');
    const session = await this.owned(user, id);
    if (session.status !== 'OPEN') throw new ConflictError('This cash session is already closed');
    const cashIn = await repository.cashReceiptsSince(user.churchId, session.sessionDate);
    const expected = D(session.openingBalance).plus(cashIn).minus(input.cashPaidOut);
    const variance = D(input.countedBalance).minus(expected);
    if (!variance.isZero() && !input.notes?.trim()) {
      throw new ValidationError(`The count is ${variance.isPositive() ? 'over' : 'short'} by ${variance.abs().toFixed(2)}. Explain the difference in the notes before closing.`);
    }
    const closed = await repository.closeCashSession(id, {
      status: 'CLOSED', closedAt: new Date(), closedBy: user.id, closingBalance: D(input.countedBalance), cashPaidOut: D(input.cashPaidOut),
      expectedClosing: expected, variance, notes: input.notes ?? null,
    });
    if (!closed) throw new ConflictError('This cash session was already closed');
    await this.audit(user, 'CASH_SESSION_CLOSED', id, { expected: expected.toFixed(2), counted: input.countedBalance, variance: variance.toFixed(2) });
    return this.view((await repository.findCashSession(id))!);
  }

  /** Live view of an open session so the cashier can see what the count should be before counting. */
  async current(user: AuthorizedUser) {
    require(user, 'finance:cash_session:manage');
    const session = await repository.findOpenCashSession(user.churchId);
    if (!session) return null;
    const cashIn = await repository.cashReceiptsSince(user.churchId, session.sessionDate);
    return { ...this.view(session), cashReceivedSoFar: toNumber(cashIn), expectedBeforePayouts: toNumber(D(session.openingBalance).plus(cashIn)) };
  }

  async list(user: AuthorizedUser) {
    require(user, 'finance:view');
    return (await repository.listCashSessions(user.churchId, 50)).map((s) => this.view(s));
  }

  private async owned(user: AuthorizedUser, id: string): Promise<Session> {
    const session = await repository.findCashSession(id);
    if (!session || session.churchId !== user.churchId) throw new NotFoundError('Cash session');
    return session;
  }

  private view(s: Session) {
    return {
      id: s.id, status: s.status, openedAt: s.sessionDate, handledBy: s.handledBy, openingBalance: toNumber(s.openingBalance),
      closedAt: s.closedAt, countedBalance: s.closingBalance === null ? null : toNumber(s.closingBalance), cashPaidOut: s.cashPaidOut === null ? null : toNumber(s.cashPaidOut),
      expectedBalance: s.expectedClosing === null ? null : toNumber(s.expectedClosing), variance: s.variance === null ? null : toNumber(s.variance), notes: s.notes,
    };
  }

  private async audit(user: AuthorizedUser, action: string, entityId: string, details: Record<string, unknown>) {
    try {
      await prisma.auditLog.create({ data: { churchId: user.churchId, action, entityType: 'CASH_SESSION', entityId, actorId: user.memberId ?? user.id, changes: JSON.stringify(details) } });
    } catch (error) {
      logger.error({ err: error, action }, 'Failed to write cash session audit log');
    }
  }
}

export const cashSessionService = new CashSessionService();
