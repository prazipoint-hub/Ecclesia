import { Router } from 'express';
import { districtFinanceController } from '../controller';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/authorization';

const router = Router({ mergeParams: true });

router.use(authenticate);

router.get(
  '/finance/dashboard',
  authorize('district_finance:view'),
  districtFinanceController.getDashboard.bind(districtFinanceController)
);

router.post(
  '/finance/receipts',
  authorize('district_receipt:create'),
  districtFinanceController.createReceipt.bind(districtFinanceController)
);

router.post(
  '/finance/expenditures',
  authorize('district_expenditure:create'),
  districtFinanceController.createExpenditure.bind(districtFinanceController)
);

router.get(
  '/finance/expenditures/pending',
  authorize('district_expenditure:approve'),
  districtFinanceController.listPendingExpenditures.bind(districtFinanceController)
);

router.post(
  '/finance/expenditures/:expenditureId/approve',
  authorize('district_expenditure:approve'),
  districtFinanceController.approveExpenditure.bind(districtFinanceController)
);

router.post(
  '/finance/expenditures/:expenditureId/pay',
  authorize('district_payment:create'),
  districtFinanceController.paymentExpenditure.bind(districtFinanceController)
);

export default router;
