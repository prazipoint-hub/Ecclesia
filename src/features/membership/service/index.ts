import { membershipRepository } from '../repository';
import { prisma } from '@/database';
import { AuthorizedUser } from '@/types';
import { v4 as uuidv4 } from 'uuid';

export class MembershipStatusChangeService {
  /**
   * Request membership status change (Statistician only)
   * Creates a PENDING request that requires pastor approval
   */
  async requestStatusChange(
    data: {
      memberId: string;
      changeType: string;
      proposedStatus?: string;
      reason: string;
      evidence?: string;
      additionalInfo?: Record<string, any>;
    },
    user: AuthorizedUser
  ) {
    // Authorization: user must have membership:status:request permission
    if (!user.permissions.includes('membership:status:request')) {
      throw new Error('Unauthorized: membership:status:request permission required');
    }

    // Fetch member
    const member = await prisma.member.findUnique({
      where: { id: data.memberId },
    });

    if (!member) {
      throw new Error('Member not found');
    }

    // Verify user is in same church
    if (member.churchId !== user.churchId) {
      throw new Error('Unauthorized: cannot request status change for member in another church');
    }

    // Certain status changes require specific handling
    let proposedStatus = data.proposedStatus;
    if (data.changeType === 'DEATH') {
      proposedStatus = 'DECEASED';
    } else if (data.changeType === 'TRANSFER') {
      proposedStatus = 'TRANSFERRED';
    }

    // Create the request in PENDING state
    const request = await membershipRepository.createStatusChangeRequest({
      id: uuidv4(),
      memberId: data.memberId,
      changeType: data.changeType,
      currentStatus: member.membershipStatus,
      proposedStatus: proposedStatus || null,
      reason: data.reason,
      evidence: data.evidence || null,
      status: 'PENDING',
      requestedById: user.id,
      requestedAt: new Date(),
      additionalInfo: data.additionalInfo ? JSON.stringify(data.additionalInfo) : null,
    });

    // Audit log
    await this.logAudit({
      requestId: request.id,
      action: 'MEMBERSHIP_CHANGE_REQUESTED',
      actorId: user.id,
      churchId: member.churchId,
      changes: {
        memberId: data.memberId,
        changeType: data.changeType,
        currentStatus: member.membershipStatus,
        proposedStatus,
      },
    });

    // Trigger notification to pastors
    await this.notifyPastorsOfPendingApproval(request.id, member.churchId);

    return request;
  }

  /**
   * Get status change request
   */
  async getStatusChangeRequest(id: string, user: AuthorizedUser) {
    const request = await membershipRepository.getStatusChangeRequest(id);

    if (!request) {
      throw new Error('Status change request not found');
    }

    // Authorization: user must be from same church or have permission to view all
    if (request.member.churchId !== user.churchId && !user.permissions.includes('membership:view:all_churches')) {
      throw new Error('Unauthorized: cannot view this request');
    }

    return request;
  }

  /**
   * List pending status change requests (for pastors)
   */
  async listPendingRequests(churchId: string, user: AuthorizedUser, options?: { skip?: number; take?: number }) {
    // Authorization: user must have membership:status:approve permission
    if (!user.permissions.includes('membership:status:approve')) {
      throw new Error('Unauthorized: membership:status:approve permission required');
    }

    if (churchId !== user.churchId && !user.permissions.includes('membership:status:approve:all_churches')) {
      throw new Error('Unauthorized: cannot view requests for another church');
    }

    return membershipRepository.listPendingRequests(churchId, options);
  }

  /**
   * Approve membership status change (Pastor only)
   * This is THE critical workflow: approval changes the member's actual status in the database
   */
  async approveStatusChange(requestId: string, user: AuthorizedUser) {
    // Authorization: user must have membership:status:approve permission (pastor)
    if (!user.permissions.includes('membership:status:approve')) {
      throw new Error('Unauthorized: membership:status:approve permission required');
    }

    // Fetch the request
    const request = await membershipRepository.getStatusChangeRequest(requestId);
    if (!request) {
      throw new Error('Status change request not found');
    }

    // Verify user is in same church
    if (request.member.churchId !== user.churchId && !user.permissions.includes('membership:status:approve:all_churches')) {
      throw new Error('Unauthorized: cannot approve request for another church');
    }

    // Verify request is still pending
    if (request.status !== 'PENDING') {
      throw new Error(`Cannot approve: request status is ${request.status}`);
    }

    // Use transaction to ensure atomic update: approval + status change + audit
    const updated = await prisma.$transaction(async (tx) => {
      // 1. Update the approval request
      const approvedRequest = await tx.membershipStatusChange.update({
        where: { id: requestId },
        data: {
          status: 'APPROVED',
          approvedById: user.id,
          approvedAt: new Date(),
        },
        include: { member: true },
      });

      // 2. Update member's actual status in the database
      if (approvedRequest.proposedStatus) {
        await tx.member.update({
          where: { id: approvedRequest.memberId },
          data: {
            membershipStatus: approvedRequest.proposedStatus,
          },
        });
      }

      return approvedRequest;
    });

    // Audit log
    await this.logAudit({
      requestId,
      action: 'MEMBERSHIP_CHANGE_APPROVED',
      actorId: user.id,
      churchId: request.member.churchId,
      changes: {
        memberId: request.memberId,
        changeType: request.changeType,
        previousStatus: request.currentStatus,
        newStatus: request.proposedStatus,
        approvedBy: user.id,
      },
    });

    // Notify member and statistician
    await this.notifyMemberOfApproval(updated.memberId, request.member.churchId, true);

    return updated;
  }

  /**
   * Reject membership status change (Pastor only)
   */
  async rejectStatusChange(requestId: string, rejectionReason: string, user: AuthorizedUser) {
    // Authorization: user must have membership:status:approve permission
    if (!user.permissions.includes('membership:status:approve')) {
      throw new Error('Unauthorized: membership:status:approve permission required');
    }

    // Fetch the request
    const request = await membershipRepository.getStatusChangeRequest(requestId);
    if (!request) {
      throw new Error('Status change request not found');
    }

    // Verify user is in same church
    if (request.member.churchId !== user.churchId && !user.permissions.includes('membership:status:approve:all_churches')) {
      throw new Error('Unauthorized: cannot reject request for another church');
    }

    // Verify request is still pending
    if (request.status !== 'PENDING') {
      throw new Error(`Cannot reject: request status is ${request.status}`);
    }

    // Update request to REJECTED (member status does NOT change)
    const updated = await membershipRepository.updateStatusChangeRequest(requestId, {
      status: 'REJECTED',
      approvedById: user.id,
      approvedAt: new Date(),
      rejectionReason,
    });

    // Audit log
    await this.logAudit({
      requestId,
      action: 'MEMBERSHIP_CHANGE_REJECTED',
      actorId: user.id,
      churchId: request.member.churchId,
      changes: {
        memberId: request.memberId,
        changeType: request.changeType,
        rejectionReason,
        memberStatusUnchanged: request.currentStatus,
      },
    });

    // Notify member and statistician
    await this.notifyMemberOfApproval(updated.memberId, request.member.churchId, false);

    return updated;
  }

  /**
   * Get approval history for member
   */
  async getApprovalHistory(memberId: string, user: AuthorizedUser) {
    // Fetch member to verify access
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { churchId: true },
    });

    if (!member) {
      throw new Error('Member not found');
    }

    if (member.churchId !== user.churchId && !user.permissions.includes('member:view:all_churches')) {
      throw new Error('Unauthorized: cannot view history for member in another church');
    }

    return membershipRepository.getApprovalHistory(memberId);
  }

  /**
   * Log audit event
   */
  private async logAudit(data: {
    requestId: string;
    action: string;
    actorId: string;
    churchId: string;
    changes: any;
  }): Promise<void> {
    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        action: data.action,
        actorId: data.actorId,
        entityType: 'MEMBERSHIP_STATUS_CHANGE',
        entityId: data.requestId,
        churchId: data.churchId,
        changes: JSON.stringify(data.changes),
        timestamp: new Date(),
      },
    });
  }

  /**
   * Notify pastors of pending approval
   */
  private async notifyPastorsOfPendingApproval(requestId: string, churchId: string): Promise<void> {
    // Find all users with membership:status:approve permission in this church
    const pastors = await prisma.user.findMany({
      where: {
        churchId,
        roles: {
          some: {
            permissions: {
              some: {
                name: 'membership:status:approve',
              },
            },
          },
        },
      },
    });

    for (const pastor of pastors) {
      await prisma.notification.create({
        data: {
          id: uuidv4(),
          recipientId: pastor.id,
          type: 'MEMBERSHIP_APPROVAL_PENDING',
          title: 'Membership Status Approval Pending',
          body: `A membership status change requires your approval.`,
          entityType: 'MEMBERSHIP_STATUS_CHANGE',
          entityId: requestId,
          createdAt: new Date(),
        },
      });
    }
  }

  /**
   * Notify member of approval/rejection
   */
  private async notifyMemberOfApproval(
    memberId: string,
    churchId: string,
    approved: boolean
  ): Promise<void> {
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { userId: true },
    });

    if (!member?.userId) return;

    const title = approved ? 'Your membership request was approved' : 'Your membership request was not approved';
    const body = approved
      ? 'Your membership status has been updated.'
      : 'Your membership status change request was declined. Please contact your pastor.';

    await prisma.notification.create({
      data: {
        id: uuidv4(),
        recipientId: member.userId,
        type: approved ? 'MEMBERSHIP_APPROVED' : 'MEMBERSHIP_REJECTED',
        title,
        body,
        entityType: 'MEMBER',
        entityId: memberId,
        createdAt: new Date(),
      },
    });
  }
}

export const membershipStatusChangeService = new MembershipStatusChangeService();
