import { Router } from 'express';
import { organizationController } from '../controller';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/authorization';

const router = Router();

router.use(authenticate);

/**
 * GET /api/v2/organizations
 */
router.get('/', organizationController.listOrganizations.bind(organizationController));

/**
 * POST /api/v2/organizations
 * Required permission: organization:create
 */
router.post('/', authorize('organization:create'), organizationController.createOrganization.bind(organizationController));

/**
 * GET /api/v2/organizations/:id
 */
router.get('/:id', organizationController.getOrganization.bind(organizationController));

/**
 * GET /api/v2/organizations/:id/dashboard
 */
router.get('/:id/dashboard', organizationController.getOrganizationDashboard.bind(organizationController));

/**
 * GET /api/v2/organizations/:id/members
 */
router.get('/:id/members', organizationController.getOrganizationMembers.bind(organizationController));

/**
 * POST /api/v2/organizations/:id/members
 * Add member to organization
 * Required permission: organization:manage
 */
router.post(
  '/:id/members',
  authorize('organization:manage'),
  organizationController.addMemberToOrganization.bind(organizationController)
);

/**
 * POST /api/v2/organizations/:id/roles
 * Assign organization leadership role
 * Required permission: organization:manage
 */
router.post(
  '/:id/roles',
  authorize('organization:manage'),
  organizationController.assignOrganizationRole.bind(organizationController)
);

export default router;
