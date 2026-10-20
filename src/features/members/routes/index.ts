import { Router } from 'express';
import { memberController } from '../controller';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/authorization';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/v2/members
 * List members (paginated)
 */
router.get('/', memberController.listMembers.bind(memberController));

/**
 * POST /api/v2/members
 * Create new member
 * Required permission: member:create
 */
router.post('/', authorize('member:create'), memberController.createMember.bind(memberController));

/**
 * GET /api/v2/members/:id
 * Get member details
 */
router.get('/:id', memberController.getMember.bind(memberController));

/**
 * PUT /api/v2/members/:id
 * Update member
 * Required permission: member:update
 */
router.put('/:id', authorize('member:update'), memberController.updateMember.bind(memberController));

/**
 * POST /api/v2/members/:id/dependants
 * Add dependent child
 * Required permission: member:create
 */
router.post(
  '/:id/dependants',
  authorize('member:create'),
  memberController.addDependent.bind(memberController)
);

/**
 * GET /api/v2/members/:id/dependants
 * Get member's dependants
 */
router.get('/:id/dependants', memberController.getDependants.bind(memberController));

export default router;
