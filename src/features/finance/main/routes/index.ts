import { Router } from 'express';
import { mainChurchFinanceController } from '../controller';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/authorization';

const router = Router({ mergeParams: true });

router.use(authenticate);

router.get('/dashboard', authorize('finance:view'), mainChurchFinanceController.getDashboard.bind(mainChurchFinanceController));
router.post('/receipts', authorize('finance:receipt:create'), mainChurchFinanceController.createReceipt.bind(mainChurchFinanceController));
router.post('/expenditures', authorize('finance:expenditure:create'), mainChurchFinanceController.createExpenditure.bind(mainChurchFinanceController));
router.get('/expenditures/pending', authorize('finance:expenditure:approve'), mainChurchFinanceController.listPendingExpenditures.bind(mainChurchFinanceController));
router.post('/expenditures/:expenditureId/approve', authorize('finance:expenditure:approve'), mainChurchFinanceController.approveExpenditure.bind(mainChurchFinanceController));
router.post('/expenditures/:expenditureId/pay', authorize('finance:payment:create'), mainChurchFinanceController.paymentExpenditure.bind(mainChurchFinanceController));

export default router;
