import { Router } from 'express';
import { districtFinanceController } from '../controller';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/authorization';

const router = Router({ mergeParams: true });

router.use(authenticate);

router.get(
  '/dashboard',
  authorize('district_finance:view'),
  districtFinanceController.getDashboard.bind(districtFinanceController)
);

router.get(
  '/expenditures/pending',
  authorize('district_finance:approve'),
  districtFinanceController.listPendingExpenditures.bind(districtFinanceController)
);

export default router;
