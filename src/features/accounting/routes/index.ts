import { NextFunction, Request, Response, Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/authorization';
import { accountingController as c } from '../controller';

const router = Router();
router.use(authenticate, (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

const view = authorize('finance:view');

router.get('/accounts', view, c.listAccounts);
router.post('/accounts', authorize('finance:coa:manage'), c.createAccount);
router.post('/accounts/seed-default', authorize('finance:coa:manage'), c.seedDefaultChart);
router.get('/accounts/:accountId/ledger', view, c.accountLedger);
router.put('/accounts/:accountId', authorize('finance:coa:manage'), c.updateAccount);

router.get('/periods', view, c.listPeriods);
router.post('/periods', authorize('finance:period:manage'), c.createPeriod);
router.post('/periods/:periodId/close', authorize('finance:period:manage'), c.closePeriod);
router.post('/periods/:periodId/reopen', authorize('finance:period:manage'), c.reopenPeriod);

router.get('/journals', view, c.listJournals);
router.post('/journals', authorize('finance:journal:create'), c.createJournal);
router.get('/journals/:journalId', view, c.getJournal);
router.put('/journals/:journalId', authorize('finance:journal:create'), c.updateJournal);
router.delete('/journals/:journalId', authorize('finance:journal:create'), c.deleteJournal);
router.post('/journals/:journalId/post', authorize('finance:journal:approve'), c.postJournal);
router.post('/journals/:journalId/reverse', authorize('finance:journal:reverse'), c.reverseJournal);
router.post('/opening-balances', authorize('finance:opening:set'), c.setOpeningBalances);
router.post('/sync', authorize('finance:journal:approve'), c.sync);

router.get('/reports/trial-balance', view, c.trialBalance);
router.get('/reports/income-statement', view, c.incomeStatement);
router.get('/reports/balance-sheet', view, c.balanceSheet);

router.get('/budgets', view, c.listBudgets);
router.post('/budgets', authorize('finance:budget:create'), c.createBudget);
router.get('/budgets/:budgetId', view, c.getBudget);
router.put('/budgets/:budgetId', authorize('finance:budget:create'), c.updateBudget);
router.post('/budgets/:budgetId/approve', authorize('finance:budget:approve'), c.approveBudget);
router.post('/budgets/:budgetId/close', authorize('finance:budget:approve'), c.closeBudget);
router.get('/budgets/:budgetId/vs-actual', view, c.budgetVersusActual);

router.get('/funds', view, c.listFunds);
router.post('/funds', authorize('finance:fund:manage'), c.createFund);
router.put('/funds/:fundId', authorize('finance:fund:manage'), c.updateFund);
router.post('/receipts/:receiptId/void', authorize('finance:journal:reverse'), c.voidReceipt);

router.get('/cash-sessions', view, c.listCashSessions);
router.get('/cash-sessions/review-queue', authorize('finance:cash_session:review'), c.cashReviewQueue);
router.get('/cash-sessions/current', authorize('finance:cash_session:manage'), c.currentCashSession);
router.post('/cash-sessions', authorize('finance:cash_session:manage'), c.openCashSession);
router.get('/cash-sessions/:sessionId/detail', c.cashSessionDetail);
router.post('/cash-sessions/:sessionId/submit', authorize('finance:cash_session:manage'), c.submitCashSession);
router.post('/cash-sessions/:sessionId/reject', authorize('finance:cash_session:review'), c.rejectCashSession);
router.post('/cash-sessions/:sessionId/approve', authorize('finance:cash_session:review'), c.approveCashSession);
router.get('/treasurer/overview', view, c.treasurerOverview);
router.get('/deposits', view, c.listDeposits);
router.post('/deposits', authorize('finance:deposit:record'), c.recordDeposit);
router.post('/deposits/:depositId/verify', authorize('finance:deposit:verify'), c.verifyDeposit);
router.post('/deposits/:depositId/reject', authorize('finance:deposit:verify'), c.rejectDeposit);
router.get('/reconciliations', view, c.listReconciliations);
router.post('/reconciliations', authorize('finance:reconcile:manage'), c.startReconciliation);
router.get('/reconciliations/:recId', view, c.getReconciliation);
router.post('/reconciliations/:recId/statement', authorize('finance:reconcile:manage'), c.importStatement);
router.post('/reconciliations/:recId/match', authorize('finance:reconcile:manage'), c.matchLine);
router.post('/reconciliations/:recId/auto-match', authorize('finance:reconcile:manage'), c.autoMatch);
router.post('/reconciliations/:recId/lines/:lineId/unmatch', authorize('finance:reconcile:manage'), c.unmatchLine);
router.post('/reconciliations/:recId/complete', authorize('finance:reconcile:complete'), c.completeReconciliation);
router.post('/cash-sessions/:sessionId/close', authorize('finance:cash_session:manage'), c.closeCashSession);

export default router;
