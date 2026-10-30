import { Prisma } from '@prisma/client';
import { logger } from '@/config/logger';
import { prisma } from '@/database';
import type { AuthorizedUser } from '@/types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/types/errors';
import { leadershipRepository as repository, type AssignmentRow } from '../repository';
import type { AssignmentListQuery, EndTermInput, StartTermInput, TermListQuery } from '../types';

const DAY = 24 * 60 * 60 * 1000;

function require(user: AuthorizedUser, permission: string): void {
  if (!user.permissions.includes(permission)) throw new ForbiddenError(`Forbidden: ${permission} permission required`);
}

/** Optional constitutional limit on terms for one appointment; unset means no limit. */
const maxTerms = () => {
  const value = Number(process.env.LEADERSHIP_MAX_TERMS);
  return Number.isInteger(value) && value > 0 ? value : null;
};

export class LeadershipService {
  async listAssignments(user: AuthorizedUser, query: AssignmentListQuery) {
    require(user, 'leadership:term:manage');
    const now = new Date();
    const where: Prisma.LeadershipAssignmentWhereInput = {
      churchId: user.churchId,
      ...(query.committeeId && { committeeId: query.committeeId }),
      ...(query.memberId && { memberId: query.memberId }),
      ...(query.activeOnly && { startDate: { lte: now }, OR: [{ endDate: null }, { endDate: { gt: now } }] }),
    };
    const [rows, total] = await repository.listAssignments(where, (query.page - 1) * query.pageSize, query.pageSize);
    return { items: rows.map((a) => this.assignmentView(a)), total, page: query.page, pageSize: query.pageSize };
  }

  async startTerm(user: AuthorizedUser, assignmentId: string, input: StartTermInput) {
    require(user, 'leadership:term:manage');
    const assignment = await this.ownedAssignment(user, assignmentId);
    const startDate = input.startDate ?? new Date();

    const lastTerm = assignment.terms[0];
    if (assignment.terms.some((t) => t.status === 'ACTIVE')) throw new ConflictError('This appointment already has an active term; end it first');
    if (lastTerm?.endDate && startDate < lastTerm.endDate) throw new ValidationError('A new term cannot start before the previous term ended');
    const termNumber = (lastTerm?.termNumber ?? 0) + 1;
    const limit = maxTerms();
    if (limit && termNumber > limit) throw new ConflictError(`Term limit reached: this appointment may serve at most ${limit} term(s)`);

    try {
      const term = await prisma.$transaction(async (tx) => {
        const created = await tx.leadershipTerm.create({
          data: { churchId: user.churchId, assignmentId, termNumber, startDate, plannedEndDate: input.plannedEndDate ?? null, notes: input.notes ?? null },
        });
        // The assignment is what grants authority, so re-opening it keeps it in step with the new term.
        await tx.leadershipAssignment.update({ where: { id: assignmentId }, data: { endDate: input.plannedEndDate ?? null } });
        return created;
      });
      await this.audit(user, 'LEADERSHIP_TERM_STARTED', term.id, { assignmentId, termNumber });
      return term;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictError('Another term was started at the same time; refresh and retry');
      throw error;
    }
  }

  async endTerm(user: AuthorizedUser, termId: string, input: EndTermInput) {
    require(user, 'leadership:term:manage');
    const term = await repository.findTerm(termId);
    if (!term || term.churchId !== user.churchId) throw new NotFoundError('Term');
    if (term.status !== 'ACTIVE') throw new ConflictError(`This term is already ${term.status.toLowerCase()}`);
    const endDate = input.endDate ?? new Date();
    if (endDate < term.startDate) throw new ValidationError('A term cannot end before it started');
    if (input.successorId) {
      if (input.successorId === term.assignment.memberId) throw new ValidationError('The successor cannot be the outgoing leader');
      if (!(await repository.findMember(user.churchId, input.successorId))) throw new ValidationError('Successor not found');
    }

    const ended = await prisma.$transaction(async (tx) => {
      const claimed = await tx.leadershipTerm.updateMany({
        where: { id: termId, status: 'ACTIVE' },
        data: { status: input.status, endDate, successorId: input.successorId ?? null, ...(input.notes !== undefined && { notes: input.notes }) },
      });
      if (claimed.count === 0) throw new ConflictError('This term has already been ended');
      // Ending the term ends the authority that came with it.
      await tx.leadershipAssignment.update({ where: { id: term.assignmentId }, data: { endDate } });
      return tx.leadershipTerm.findUnique({ where: { id: termId } });
    });
    await this.audit(user, 'LEADERSHIP_TERM_ENDED', termId, { status: input.status, successorId: input.successorId ?? null });
    return ended;
  }

  async listTerms(user: AuthorizedUser, query: TermListQuery) {
    require(user, 'leadership:term:manage');
    const now = new Date();
    const where: Prisma.LeadershipTermWhereInput = {
      churchId: user.churchId,
      ...(query.status && { status: query.status }),
      ...(query.expiringWithinDays && {
        status: 'ACTIVE',
        plannedEndDate: { gte: now, lte: new Date(now.getTime() + query.expiringWithinDays * DAY) },
      }),
    };
    const [rows, total] = await repository.listTerms(where, (query.page - 1) * query.pageSize, query.pageSize);
    return {
      items: rows.map((t) => ({
        id: t.id, assignmentId: t.assignmentId, termNumber: t.termNumber, status: t.status, startDate: t.startDate, plannedEndDate: t.plannedEndDate,
        endDate: t.endDate, successorId: t.successorId, notes: t.notes,
        member: t.assignment.member, roleName: t.assignment.role.name, committeeName: t.assignment.committee?.name ?? null, position: t.assignment.position,
        daysRemaining: t.status === 'ACTIVE' && t.plannedEndDate ? Math.ceil((t.plannedEndDate.getTime() - now.getTime()) / DAY) : null,
      })),
      total, page: query.page, pageSize: query.pageSize,
    };
  }

  private async ownedAssignment(user: AuthorizedUser, id: string): Promise<AssignmentRow> {
    const assignment = await repository.findAssignment(id);
    if (!assignment || assignment.churchId !== user.churchId) throw new NotFoundError('Appointment');
    return assignment;
  }

  private assignmentView(a: AssignmentRow) {
    const current = a.terms.find((t) => t.status === 'ACTIVE') ?? null;
    return {
      id: a.id, member: a.member, role: a.role, committee: a.committee, position: a.position, startDate: a.startDate, endDate: a.endDate,
      termCount: a.terms.length,
      currentTerm: current && { id: current.id, termNumber: current.termNumber, startDate: current.startDate, plannedEndDate: current.plannedEndDate },
    };
  }

  private async audit(user: AuthorizedUser, action: string, entityId: string, details: Record<string, unknown>) {
    try {
      await prisma.auditLog.create({ data: { churchId: user.churchId, action, entityType: 'LEADERSHIP', entityId, actorId: user.memberId ?? user.id, changes: JSON.stringify(details) } });
    } catch (error) {
      logger.error({ err: error, action }, 'Failed to write leadership audit log');
    }
  }
}

export const leadershipService = new LeadershipService();
