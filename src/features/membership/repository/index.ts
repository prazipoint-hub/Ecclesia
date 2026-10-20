import { prisma } from '@/database';
import { MembershipStatusChange, Prisma } from '@prisma/client';
import { AuthorizedUser } from '@/types';

export class MembershipRepository {
  /**
   * Create membership status change request
   */
  async createStatusChangeRequest(
    data: Prisma.MembershipStatusChangeCreateInput
  ): Promise<MembershipStatusChange> {
    return prisma.membershipStatusChange.create({
      data,
      include: { member: true },
    });
  }

  /**
   * Get status change request by ID
   */
  async getStatusChangeRequest(id: string): Promise<MembershipStatusChange | null> {
    return prisma.membershipStatusChange.findUnique({
      where: { id },
      include: { member: true, requestedByUser: true, approvedByUser: true },
    });
  }

  /**
   * List pending status change requests (for pastors to approve)
   */
  async listPendingRequests(
    churchId: string,
    options?: { skip?: number; take?: number }
  ): Promise<{ requests: MembershipStatusChange[]; total: number }> {
    const [requests, total] = await Promise.all([
      prisma.membershipStatusChange.findMany({
        where: {
          status: 'PENDING',
          member: { churchId },
        },
        include: { member: true, requestedByUser: true },
        skip: options?.skip,
        take: options?.take,
        orderBy: { requestedAt: 'desc' },
      }),
      prisma.membershipStatusChange.count({
        where: {
          status: 'PENDING',
          member: { churchId },
        },
      }),
    ]);

    return { requests, total };
  }

  /**
   * List all status change requests for a member
   */
  async listForMember(
    memberId: string,
    options?: { skip?: number; take?: number }
  ): Promise<{ requests: MembershipStatusChange[]; total: number }> {
    const [requests, total] = await Promise.all([
      prisma.membershipStatusChange.findMany({
        where: { memberId },
        include: { requestedByUser: true, approvedByUser: true },
        skip: options?.skip,
        take: options?.take,
        orderBy: { requestedAt: 'desc' },
      }),
      prisma.membershipStatusChange.count({ where: { memberId } }),
    ]);

    return { requests, total };
  }

  /**
   * Update status change request (approve/reject)
   */
  async updateStatusChangeRequest(
    id: string,
    data: Prisma.MembershipStatusChangeUpdateInput
  ): Promise<MembershipStatusChange> {
    return prisma.membershipStatusChange.update({
      where: { id },
      data,
      include: { member: true, approvedByUser: true },
    });
  }

  /**
   * Count pending requests for church
   */
  async countPendingRequests(churchId: string): Promise<number> {
    return prisma.membershipStatusChange.count({
      where: {
        status: 'PENDING',
        member: { churchId },
      },
    });
  }

  /**
   * Get approval history for member
   */
  async getApprovalHistory(memberId: string): Promise<MembershipStatusChange[]> {
    return prisma.membershipStatusChange.findMany({
      where: {
        memberId,
        status: { in: ['APPROVED', 'REJECTED'] },
      },
      include: { requestedByUser: true, approvedByUser: true },
      orderBy: { approvedAt: 'desc' },
    });
  }
}

export const membershipRepository = new MembershipRepository();
