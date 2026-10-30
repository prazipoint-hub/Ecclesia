import { Prisma } from '@prisma/client';
import { prisma } from '@/database';
import { logger } from '@/config/logger';
import type { AuthorizedUser } from '@/types';
import { ConflictError, ForbiddenError, NotFoundError } from '@/types/errors';
import { myAccountRepository as repository } from '../repository/myAccount';
import type { UpdateOwnProfileInput } from '../types/myAccount';
import { buildGivingStatementPdf } from './givingStatement';

type Money = Prisma.Decimal.Value;

const decimal = (value: Money) => new Prisma.Decimal(value);
const toNumber = (value: Money) => Number(decimal(value).toFixed(2));

type GivingRow = {
  id: string;
  source: 'CHURCH' | 'SECTION';
  receiptNumber: string;
  amount: number;
  currency: string;
  incomeType: string;
  paymentMethod: string;
  status: string;
  issuedAt: Date;
  fundName: string | null;
  sectionName: string | null;
};

type RawReceipt = {
  id: string;
  receiptNumber: string;
  amount: Money;
  currency: string;
  incomeType: string;
  paymentMethod: string;
  status: string;
  issuedAt: Date;
};

const fromChurchReceipt = (r: RawReceipt & { fund?: { name: string } | null }): GivingRow => ({
  id: r.id,
  source: 'CHURCH',
  receiptNumber: r.receiptNumber,
  amount: toNumber(r.amount),
  currency: r.currency,
  incomeType: r.incomeType,
  paymentMethod: r.paymentMethod,
  status: r.status,
  issuedAt: r.issuedAt,
  fundName: r.fund?.name ?? null,
  sectionName: null,
});

const fromSectionReceipt = (r: RawReceipt & { section?: { name: string } | null }): GivingRow => ({
  id: r.id,
  source: 'SECTION',
  receiptNumber: r.receiptNumber,
  amount: toNumber(r.amount),
  currency: r.currency,
  incomeType: r.incomeType,
  paymentMethod: r.paymentMethod,
  status: r.status,
  issuedAt: r.issuedAt,
  fundName: null,
  sectionName: r.section?.name ?? null,
});

const byNewest = (a: { issuedAt: Date }, b: { issuedAt: Date }) => b.issuedAt.getTime() - a.issuedAt.getTime();

export class MyAccountService {
  private requireMemberId(user: AuthorizedUser): string {
    if (!user.memberId) throw new ForbiddenError('Forbidden: your account is not linked to a member profile');
    return user.memberId;
  }

  private recipientIds(user: AuthorizedUser, memberId: string): string[] {
    // Existing notification writers store either the user id or the member id as recipient.
    return [user.id, memberId];
  }

  // ---------------------------------------------------------------- profile

  async getProfile(user: AuthorizedUser) {
    const member = await repository.findProfile(this.requireMemberId(user));
    if (!member) throw new NotFoundError('Member profile');
    return {
      id: member.id,
      membershipNumber: member.membershipNumber,
      firstName: member.firstName,
      middleName: member.middleName,
      lastName: member.lastName,
      email: member.email,
      phone: member.phone,
      address: member.address,
      gender: member.gender,
      dateOfBirth: member.dateOfBirth,
      maritalStatus: member.maritalStatus,
      membershipStatus: member.membershipStatus,
      joinDate: member.joinDate,
      membershipDate: member.membershipDate,
      isDependent: member.isDependent,
      church: member.church,
      section: member.section,
      family: member.family,
    };
  }

  async updateProfile(user: AuthorizedUser, input: UpdateOwnProfileInput) {
    const memberId = this.requireMemberId(user);
    const before = await repository.findProfile(memberId);
    if (!before) throw new NotFoundError('Member profile');

    const changes: Prisma.MemberUpdateInput = {};
    const previous: Record<string, unknown> = {};
    const next: Record<string, unknown> = {};
    for (const field of ['phone', 'address', 'email'] as const) {
      const value = input[field];
      if (value !== undefined && value !== before[field]) {
        (changes as Record<string, unknown>)[field] = value;
        previous[field] = before[field];
        next[field] = value;
      }
    }

    if (Object.keys(changes).length > 0) {
      try {
        await repository.updateProfile(memberId, changes);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictError('That email address is already used by another member');
        }
        throw error;
      }
      await this.logAudit(before.churchId, memberId, previous, next);
    }
    return this.getProfile(user);
  }

  private async logAudit(churchId: string, memberId: string, previous: unknown, next: unknown): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          churchId,
          action: 'MEMBER_SELF_UPDATED',
          entityType: 'MEMBER',
          entityId: memberId,
          actorId: memberId,
          previousState: JSON.stringify(previous),
          newState: JSON.stringify(next),
        },
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to write self-service audit log');
    }
  }

  // ----------------------------------------------------------------- family

  async getFamily(user: AuthorizedUser) {
    const memberId = this.requireMemberId(user);
    const member = await repository.findProfile(memberId);
    if (!member) throw new NotFoundError('Member profile');

    const [relationships, dependents, household] = await repository.findFamilyContext(memberId, member.familyId);

    const mapped = relationships.flatMap((row) => {
      let relationshipType: 'SPOUSE' | 'PARENT' | 'CHILD';
      let other;
      if (row.partner1Id === memberId) [relationshipType, other] = ['SPOUSE', row.partner2];
      else if (row.partner2Id === memberId) [relationshipType, other] = ['SPOUSE', row.partner1];
      else if (row.parentId === memberId) [relationshipType, other] = ['CHILD', row.child];
      else [relationshipType, other] = ['PARENT', row.parent];
      return other ? [{ id: row.id, relationshipType, member: other }] : [];
    });

    return { family: member.family, relationships: mapped, dependents, household };
  }

  // ----------------------------------------------------------------- giving

  async listGiving(user: AuthorizedUser, query: { year?: number; page: number; pageSize: number }) {
    const memberId = this.requireMemberId(user);
    const { year, page, pageSize } = query;

    const [churchRows, sectionRows, churchCount, sectionCount] = await repository.listReceipts(memberId, year, page * pageSize);
    const items = [...churchRows.map(fromChurchReceipt), ...sectionRows.map(fromSectionReceipt)]
      .sort(byNewest)
      .slice((page - 1) * pageSize, page * pageSize);

    return { items, total: churchCount + sectionCount, page, pageSize, availableYears: await this.availableYears(memberId) };
  }

  async getGivingSummary(user: AuthorizedUser, requestedYear?: number) {
    const memberId = this.requireMemberId(user);
    const year = requestedYear ?? new Date().getUTCFullYear();
    const rows = await this.issuedRowsForYear(memberId, year);

    const totals = new Map<string, { total: Prisma.Decimal; count: number }>();
    const byType = new Map<string, Prisma.Decimal>();
    const byMonth = new Map<string, Prisma.Decimal>();
    for (const row of rows) {
      const amount = decimal(row.amount);
      const t = totals.get(row.currency) ?? { total: decimal(0), count: 0 };
      totals.set(row.currency, { total: t.total.plus(amount), count: t.count + 1 });

      const typeKey = `${row.incomeType}|${row.currency}`;
      byType.set(typeKey, (byType.get(typeKey) ?? decimal(0)).plus(amount));

      const monthKey = `${row.issuedAt.getUTCMonth() + 1}|${row.currency}`;
      byMonth.set(monthKey, (byMonth.get(monthKey) ?? decimal(0)).plus(amount));
    }

    const currencies = [...totals.keys()].sort();
    return {
      year,
      availableYears: await this.availableYears(memberId),
      totals: currencies.map((currency) => ({ currency, total: toNumber(totals.get(currency)!.total), count: totals.get(currency)!.count })),
      byIncomeType: [...byType.entries()]
        .map(([key, total]) => {
          const [incomeType, currency] = key.split('|');
          return { incomeType, currency, total: toNumber(total) };
        })
        .sort((a, b) => b.total - a.total),
      byMonth: currencies.flatMap((currency) =>
        Array.from({ length: 12 }, (_, i) => ({
          month: i + 1,
          currency,
          total: toNumber(byMonth.get(`${i + 1}|${currency}`) ?? 0),
        }))
      ),
    };
  }

  async buildStatement(user: AuthorizedUser, requestedYear?: number): Promise<{ filename: string; pdf: Buffer }> {
    const memberId = this.requireMemberId(user);
    const year = requestedYear ?? new Date().getUTCFullYear();
    const [profile, rows] = await Promise.all([this.getProfile(user), this.issuedRowsForYear(memberId, year)]);

    const pdf = await buildGivingStatementPdf({
      churchName: profile.church.name,
      memberName: [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(' '),
      membershipNumber: profile.membershipNumber,
      year,
      lines: rows.map((row) => ({
        issuedAt: row.issuedAt,
        receiptNumber: row.receiptNumber,
        description: [row.incomeType.replace(/_/g, ' ').toLowerCase(), row.fundName ?? row.sectionName].filter(Boolean).join(' - '),
        paymentMethod: row.paymentMethod,
        currency: row.currency,
        amount: row.amount,
      })),
    });
    return { filename: `giving-statement-${year}.pdf`, pdf };
  }

  private async issuedRowsForYear(memberId: string, year: number): Promise<GivingRow[]> {
    const [churchRows, sectionRows] = await repository.listAllReceiptsForYear(memberId, year);
    return [...churchRows.map(fromChurchReceipt), ...sectionRows.map(fromSectionReceipt)]
      .filter((row) => row.status === 'ISSUED')
      .sort((a, b) => a.issuedAt.getTime() - b.issuedAt.getTime());
  }

  private async availableYears(memberId: string): Promise<number[]> {
    const dates = await repository.listReceiptDates(memberId);
    return [...new Set(dates.map((date) => date.getUTCFullYear()))].sort((a, b) => b - a);
  }

  // ---------------------------------------------------------- notifications

  async listNotifications(user: AuthorizedUser, query: { page: number; pageSize: number }) {
    const memberId = this.requireMemberId(user);
    const { page, pageSize } = query;
    const [system, pastoral, systemTotal, pastoralTotal, systemUnread, pastoralUnread] = await repository.listNotifications(
      this.recipientIds(user, memberId),
      memberId,
      page * pageSize
    );

    const items = [
      ...system.map((n) => ({
        id: n.id,
        source: 'SYSTEM' as const,
        type: n.type,
        title: n.title,
        body: n.body,
        read: n.readAt !== null,
        createdAt: n.createdAt,
        actionUrl: null as string | null,
      })),
      ...pastoral.map((n) => ({
        id: n.id,
        source: 'PASTORAL' as const,
        type: n.notificationType,
        title: n.title,
        body: n.message,
        read: n.read,
        createdAt: n.createdAt,
        actionUrl: n.actionUrl,
      })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice((page - 1) * pageSize, page * pageSize);

    return { items, total: systemTotal + pastoralTotal, unreadCount: systemUnread + pastoralUnread, page, pageSize };
  }

  async markNotificationRead(user: AuthorizedUser, notificationId: string): Promise<void> {
    const memberId = this.requireMemberId(user);
    const found = await repository.markNotificationRead(notificationId, this.recipientIds(user, memberId), memberId);
    if (!found) throw new NotFoundError('Notification');
  }

  async markAllNotificationsRead(user: AuthorizedUser): Promise<void> {
    const memberId = this.requireMemberId(user);
    await repository.markAllNotificationsRead(this.recipientIds(user, memberId), memberId);
  }
}

export const myAccountService = new MyAccountService();
