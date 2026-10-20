import { Router } from 'express';
import { circuitFinanceController } from '../controller';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/authorization';

const router = Router({ mergeParams: true });

router.use(authenticate);

router.get(
  '/dashboard',
  authorize('circuit_finance:view'),
  circuitFinanceController.getDashboard.bind(circuitFinanceController)
);

router.post(
  '/receipts',
  authorize('circuit_receipt:create'),
  circuitFinanceController.createReceipt.bind(circuitFinanceController)
);

router.post(
  '/expenditures',
  authorize('circuit_expenditure:create'),
  circuitFinanceController.createExpenditure.bind(circuitFinanceController)
);

router.get(
  '/expenditures/pending',
  authorize('circuit_expenditure:approve'),
  circuitFinanceController.listPendingExpenditures.bind(circuitFinanceController)
);

router.post(
  '/expenditures/:expenditureId/approve',
  authorize('circuit_expenditure:approve'),
  circuitFinanceController.approveExpenditure.bind(circuitFinanceController)
);

router.post(
  '/expenditures/:expenditureId/pay',
  authorize('circuit_payment:create'),
  circuitFinanceController.paymentExpenditure.bind(circuitFinanceController)
);

export default router;
