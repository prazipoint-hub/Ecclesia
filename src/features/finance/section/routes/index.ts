import { Router } from 'express';
import { sectionFinanceController } from '../controller';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/authorization';

const router = Router({ mergeParams: true });

router.use(authenticate);

/**
 * GET /api/v2/sections/:sectionId/finance/dashboard
 * Section financial dashboard
 * Required permission: section_finance:view
 */
router.get(
  '/dashboard',
  authorize('section_finance:view'),
  sectionFinanceController.getDashboard.bind(sectionFinanceController)
);

/**
 * POST /api/v2/sections/:sectionId/finance/receipts
 * Create section receipt
 * Required permission: section_receipt:create (typically section treasurer)
 */
router.post(
  '/receipts',
  authorize('section_receipt:create'),
  sectionFinanceController.createReceipt.bind(sectionFinanceController)
);

/**
 * POST /api/v2/sections/:sectionId/finance/expenditures
 * Create section expenditure request
 * Required permission: section_expenditure:create (typically section treasurer)
 */
router.post(
  '/expenditures',
  authorize('section_expenditure:create'),
  sectionFinanceController.createExpenditure.bind(sectionFinanceController)
);

/**
 * GET /api/v2/sections/:sectionId/finance/expenditures/pending
 * List pending section expenditures for approval
 * Required permission: section_expenditure:approve (section leader/secretary)
 */
router.get(
  '/expenditures/pending',
  authorize('section_expenditure:approve'),
  sectionFinanceController.listPendingExpenditures.bind(sectionFinanceController)
);

/**
 * POST /api/v2/sections/:sectionId/finance/expenditures/:expenditureId/approve
 * Approve or reject section expenditure
 * CRITICAL: Section leader/secretary only, treasurer cannot approve their own
 * Required permission: section_expenditure:approve
 */
router.post(
  '/expenditures/:expenditureId/approve',
  authorize('section_expenditure:approve'),
  sectionFinanceController.approveExpenditure.bind(sectionFinanceController)
);

/**
 * POST /api/v2/sections/:sectionId/finance/expenditures/:expenditureId/pay
 * Record payment for approved expenditure
 * Required permission: section_payment:create (typically section treasurer)
 */
router.post(
  '/expenditures/:expenditureId/pay',
  authorize('section_payment:create'),
  sectionFinanceController.paymentExpenditure.bind(sectionFinanceController)
);

export default router;
