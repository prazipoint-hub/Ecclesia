import { Prisma } from '@prisma/client';
import { prisma } from '@/database';

const assignmentInclude = {
  member: { select: { id: true, firstName: true, lastName: true } },
  role: { select: { id: true, name: true } },
  committee: { select: { id: true, name: true } },
  terms: { orderBy: { termNumber: 'desc' } },
} satisfies Prisma.LeadershipAssignmentInclude;

export type AssignmentRow = Prisma.LeadershipAssignmentGetPayload<{ include: typeof assignmentInclude }>;

export class LeadershipRepository {
  async listAssignments(where: Prisma.LeadershipAssignmentWhereInput, skip: number, take: number) {
    return Promise.all([
      prisma.leadershipAssignment.findMany({ where, skip, take, orderBy: [{ startDate: 'desc' }, { id: 'asc' }], include: assignmentInclude }),
      prisma.leadershipAssignment.count({ where }),
    ]);
  }

  findAssignment(id: string) {
    return prisma.leadershipAssignment.findUnique({ where: { id }, include: assignmentInclude });
  }

  async listTerms(where: Prisma.LeadershipTermWhereInput, skip: number, take: number) {
    return Promise.all([
      prisma.leadershipTerm.findMany({
        where, skip, take, orderBy: [{ plannedEndDate: 'asc' }, { id: 'asc' }],
        include: { assignment: { select: { position: true, member: { select: { id: true, firstName: true, lastName: true } }, role: { select: { name: true } }, committee: { select: { name: true } } } } },
      }),
      prisma.leadershipTerm.count({ where }),
    ]);
  }

  findTerm(id: string) {
    return prisma.leadershipTerm.findUnique({ where: { id }, include: { assignment: true } });
  }

  findMember(churchId: string, memberId: string) {
    return prisma.member.findFirst({ where: { id: memberId, churchId, archivedAt: null }, select: { id: true } });
  }
}

export const leadershipRepository = new LeadershipRepository();
