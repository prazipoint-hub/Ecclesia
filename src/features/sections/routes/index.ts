import { Router } from 'express';
import { sectionController } from '../controller';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/authorization';

const router = Router();

router.use(authenticate);

/**
 * GET /api/v2/sections
 */
router.get('/', sectionController.listSections.bind(sectionController));

/**
 * POST /api/v2/sections
 * Required permission: section:create
 */
router.post('/', authorize('section:create'), sectionController.createSection.bind(sectionController));

/**
 * GET /api/v2/sections/:id
 */
router.get('/:id', sectionController.getSection.bind(sectionController));

/**
 * GET /api/v2/sections/:id/members
 */
router.get('/:id/members', sectionController.getSectionMembers.bind(sectionController));

/**
 * GET /api/v2/sections/:id/leadership
 */
router.get('/:id/leadership', sectionController.getSectionLeadership.bind(sectionController));

/**
 * POST /api/v2/sections/leadership
 * Assign section leadership
 * Required permission: section:manage
 */
router.post(
  '/leadership',
  authorize('section:manage'),
  sectionController.assignLeadership.bind(sectionController)
);

export default router;
