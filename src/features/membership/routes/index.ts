import { Router } from 'express';
import { membershipController } from '../controller';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/authorization';

const router = Router();

router.use(authenticate);

/**
 * POST /api/v2/membership/status-changes/request
 * Statistician/Vice Statistician requests a membership status change
 * Required permission: membership:status:request
 */
router.post(
  '/status-changes/request',
  authorize('membership:status:request'),
  membershipController.requestStatusChange.bind(membershipController)
);

/**
 * GET /api/v2/membership/status-changes/pending
 * List pending status change requests requiring approval
 * Required permission: membership:status:approve (typically pastors)
 */
router.get(
  '/status-changes/pending',
  authorize('membership:status:approve'),
  membershipController.listPendingRequests.bind(membershipController)
);

/**
 * GET /api/v2/membership/status-changes/:id
 */
router.get('/status-changes/:id', membershipController.getStatusChangeRequest.bind(membershipController));

/**
 * POST /api/v2/membership/status-changes/:id/approve
 * Pastor approves the status change
 * THIS IS THE CRITICAL WORKFLOW: only approval changes the member's actual database status
 * Required permission: membership:status:approve
 */
router.post(
  '/status-changes/:id/approve',
  authorize('membership:status:approve'),
  membershipController.approveStatusChange.bind(membershipController)
);

/**
 * POST /api/v2/membership/status-changes/:id/reject
 * Pastor rejects the status change
 * Member status remains unchanged
 * Required permission: membership:status:approve
 */
router.post(
  '/status-changes/:id/reject',
  authorize('membership:status:approve'),
  membershipController.rejectStatusChange.bind(membershipController)
);

/**
 * GET /api/v2/members/:memberId/approval-history
 */
router.get('/approval-history/:memberId', membershipController.getApprovalHistory.bind(membershipController));

export default router;
