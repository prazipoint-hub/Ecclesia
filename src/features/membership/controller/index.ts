import { Request, Response } from 'express';
import { membershipStatusChangeService } from '../service';
import { RequestMembershipStatusChangeSchema, ApproveStatusChangeSchema } from '../types';
import { AuthRequest } from '@/types';
import { handleError } from '@/utils/errorHandler';

export class MembershipController {
  /**
   * POST /api/v2/membership/status-changes/request
   * Statistician requests a membership status change
   */
  async requestStatusChange(req: AuthRequest, res: Response): Promise<void> {
    try {
      const validated = RequestMembershipStatusChangeSchema.parse(req.body);
      const request = await membershipStatusChangeService.requestStatusChange(validated, req.user!);

      res.status(201).json(request);
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * GET /api/v2/membership/status-changes/:id
   */
  async getStatusChangeRequest(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const request = await membershipStatusChangeService.getStatusChangeRequest(id, req.user!);

      res.json(request);
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * GET /api/v2/membership/status-changes/pending
   * List pending status change requests (for pastors)
   */
  async listPendingRequests(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { churchId, skip = '0', take = '20' } = req.query;

      if (!churchId || typeof churchId !== 'string') {
        res.status(400).json({ error: 'churchId query parameter required' });
        return;
      }

      const { requests, total } = await membershipStatusChangeService.listPendingRequests(
        churchId,
        req.user!,
        {
          skip: parseInt(skip as string),
          take: parseInt(take as string),
        }
      );

      res.json({ requests, total, skip, take });
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * POST /api/v2/membership/status-changes/:id/approve
   * Pastor approves a membership status change
   * This triggers the actual database update of member status
   */
  async approveStatusChange(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updated = await membershipStatusChangeService.approveStatusChange(id, req.user!);

      res.json(updated);
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * POST /api/v2/membership/status-changes/:id/reject
   * Pastor rejects a membership status change
   * Member status does NOT change
   */
  async rejectStatusChange(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { rejectionReason } = req.body;

      if (!rejectionReason) {
        res.status(400).json({ error: 'rejectionReason required' });
        return;
      }

      const updated = await membershipStatusChangeService.rejectStatusChange(
        id,
        rejectionReason,
        req.user!
      );

      res.json(updated);
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * GET /api/v2/members/:memberId/approval-history
   */
  async getApprovalHistory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { memberId } = req.params;
      const history = await membershipStatusChangeService.getApprovalHistory(memberId, req.user!);

      res.json(history);
    } catch (error) {
      handleError(error, res);
    }
  }
}

export const membershipController = new MembershipController();
