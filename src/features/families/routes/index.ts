import { Router } from 'express';
import { familyController } from '../controller';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/authorization';

const router = Router();

router.use(authenticate);

/**
 * GET /api/v2/families
 */
router.get('/', familyController.listFamilies.bind(familyController));

/**
 * POST /api/v2/families
 * Required permission: family:create
 */
router.post('/', authorize('family:create'), familyController.createFamily.bind(familyController));

/**
 * GET /api/v2/families/:id
 */
router.get('/:id', familyController.getFamily.bind(familyController));

/**
 * GET /api/v2/families/:id/members
 */
router.get('/:id/members', familyController.getFamilyMembers.bind(familyController));

/**
 * POST /api/v2/families/:id/members
 * Required permission: family:update
 */
router.post(
  '/:id/members',
  authorize('family:update'),
  familyController.addMemberToFamily.bind(familyController)
);

export default router;
