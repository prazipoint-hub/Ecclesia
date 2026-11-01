import { Prisma } from '@prisma/client';
import { prisma } from '@/database';
import { activeAssignments, resolvePermissionNames } from '@/features/auth/permissions';

export class SavedReportRepository {
  create(data: Prisma.SavedReportUncheckedCreateInput) {
    return prisma.savedReport.create({ data });
  }
  find(churchId: string, id: string) {
    return prisma.savedReport.findFirst({ where: { id, churchId } });
  }
  list(churchId: string, userId: string, mineOnly: boolean, seeAll: boolean) {
    const where: Prisma.SavedReportWhereInput = seeAll && !mineOnly
      ? { churchId }
      : { churchId, OR: mineOnly ? [{ createdBy: userId }] : [{ createdBy: userId }, { visibility: 'CHURCH' }] };
    return prisma.savedReport.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 200 });
  }
  update(id: string, data: Prisma.SavedReportUncheckedUpdateInput) {
    return prisma.savedReport.update({ where: { id }, data });
  }
  delete(id: string) {
    return prisma.savedReport.delete({ where: { id } });
  }
  /** A scheduled run is claimed by moving nextRunAt from the value the caller read, so two workers never both run it. */
  claimRun(id: string, expectedNextRunAt: Date, nextRunAt: Date | null, now: Date) {
    return prisma.savedReport.updateMany({ where: { id, isActive: true, nextRunAt: expectedNextRunAt }, data: { nextRunAt, lastRunAt: now } });
  }
  due(now: Date, take: number) {
    return prisma.savedReport.findMany({ where: { schedule: { not: 'NONE' }, isActive: true, nextRunAt: { lte: now } }, orderBy: { nextRunAt: 'asc' }, take });
  }
  recordOutcome(id: string, failed: boolean) {
    return failed
      ? prisma.savedReport.update({ where: { id }, data: { failureCount: { increment: 1 } } })
      : prisma.savedReport.update({ where: { id }, data: { failureCount: 0 } });
  }

  createExecution(data: Prisma.ReportExecutionUncheckedCreateInput) {
    return prisma.reportExecution.create({ data });
  }
  finishExecution(id: string, data: Prisma.ReportExecutionUncheckedUpdateInput) {
    return prisma.reportExecution.update({ where: { id }, data: { ...data, finishedAt: new Date() } });
  }
  async listExecutions(where: Prisma.ReportExecutionWhereInput, skip: number, take: number) {
    const [items, total] = await Promise.all([
      prisma.reportExecution.findMany({ where, orderBy: { startedAt: 'desc' }, skip, take }),
      prisma.reportExecution.count({ where }),
    ]);
    return { items, total };
  }

  /** Users of one church with their current permissions, for checking who may receive or run a report. */
  async usersWithPermissions(churchId: string, where: { emails?: string[]; id?: string }) {
    const now = new Date();
    const users = await prisma.user.findMany({
      where: { churchId, ...(where.id ? { id: where.id } : {}), ...(where.emails ? { email: { in: where.emails } } : {}) },
      select: {
        id: true, email: true, churchId: true, memberId: true,
        member: {
          select: {
            leadershipAssignments: {
              where: { startDate: { lte: now }, OR: [{ endDate: null }, { endDate: { gt: now } }] },
              include: { role: { include: { permissions: { include: { permission: true } } } } },
            },
          },
        },
      },
      take: 100,
    });
    return users.map((u) => ({
      id: u.id, email: u.email, churchId: u.churchId as string, memberId: u.memberId,
      permissions: resolvePermissionNames(activeAssignments(u.member?.leadershipAssignments ?? [])),
    }));
  }
}

export const savedReportRepository = new SavedReportRepository();
