import { Router } from 'express';
import { NextFunction, Request, Response } from 'express';
import { reportingController } from '../controller';
import { savedReportController as c } from '../controller/saved';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/authorization';

const router = Router();

router.use(authenticate, (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Catalog, saved reports and dashboards. Each service checks the permission its report type needs.
router.get('/catalog', c.catalog);
router.post('/run', c.run);
router.get('/saved', c.listSaved);
router.post('/saved', c.createSaved);
router.post('/saved/run-due', authorize('report:schedule:run'), c.runDue);
router.get('/saved/:id', c.getSaved);
router.put('/saved/:id', c.updateSaved);
router.delete('/saved/:id', c.deleteSaved);
router.post('/saved/:id/run', c.runSaved);
router.get('/executions', c.executions);
router.get('/dashboards/church', c.churchDashboard);
router.get('/dashboards/section/:sectionId', c.sectionDashboard);
router.get('/dashboards/hierarchy/:level', c.hierarchyDashboard);

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
