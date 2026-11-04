import { Router } from 'express';
import { reportingController } from '../controller';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/authorization';

const router = Router();

router.use(authenticate);

/**
 * POST /api/v2/reports/financial
 * Generate financial report
 * Required permission: report:view:financial
 */
router.post(
  '/financial',
  authorize('report:view:financial'),
  reportingController.generateFinancialReport.bind(reportingController)
);

/**
 * POST /api/v2/reports/administrative
 * Generate administrative report
 * Required permission: report:view:administrative
 */
router.post(
  '/administrative',
  authorize('report:view:administrative'),
  reportingController.generateAdministrativeReport.bind(reportingController)
);

/**
 * POST /api/v2/reports/audit
 * Generate audit report
 * Required permission: report:view:audit (typically Audit Committee)
 */
router.post(
  '/audit',
  authorize('report:view:audit'),
  reportingController.generateAuditReport.bind(reportingController)
);

export default router;
