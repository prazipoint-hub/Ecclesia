import { Response } from 'express';
import { AuthRequest } from '@/types';
import { handleError } from '@/utils/errorHandler';
import { budgetService } from '../service/budgets';
import { cashSessionService } from '../service/cashSessions';
import { cashReviewService } from '../service/cashReview';
import { bankReconciliationService } from '../service/bankReconciliation';
import { getPolicy, setPolicy } from '@/features/finance/shared/approvalPolicy';
import { depositService } from '../service/deposits';
import { fundService } from '../service/funds';
import { ledgerService } from '../service/ledger';
import {
  CloseCashSessionSchema, CreateAccountSchema, CreateBudgetSchema, CreateFundSchema, CreatePeriodSchema, JournalListQuerySchema, JournalSchema,
  LedgerQuerySchema, OpenCashSessionSchema, OpeningBalanceSchema, ReopenPeriodSchema, ReportQuerySchema, ReverseSchema, SyncSchema,
  UpdateAccountSchema, UpdateBudgetSchema, UpdateFundSchema, VoidReceiptSchema,
} from '../types';

type Handler = (req: AuthRequest, res: Response) => Promise<void>;

const guarded = (handler: Handler): Handler => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    handleError(error, res);
  }
};

export class AccountingController {
  // accounts
  listAccounts = guarded(async (req, res) => { res.json(await ledgerService.listAccounts(req.user!)); });
  createAccount = guarded(async (req, res) => { res.status(201).json(await ledgerService.createAccount(req.user!, CreateAccountSchema.parse(req.body))); });
  updateAccount = guarded(async (req, res) => { res.json(await ledgerService.updateAccount(req.user!, req.params.accountId, UpdateAccountSchema.parse(req.body))); });
  seedDefaultChart = guarded(async (req, res) => { res.json(await ledgerService.seedDefaultChart(req.user!)); });
  accountLedger = guarded(async (req, res) => {
    const { from, to } = LedgerQuerySchema.parse(req.query);
    res.json(await ledgerService.accountLedger(req.user!, req.params.accountId, from, to));
  });

  // periods
  listPeriods = guarded(async (req, res) => { res.json(await ledgerService.listPeriods(req.user!)); });
  createPeriod = guarded(async (req, res) => { res.status(201).json(await ledgerService.createPeriod(req.user!, CreatePeriodSchema.parse(req.body))); });
  closePeriod = guarded(async (req, res) => { res.json(await ledgerService.closePeriod(req.user!, req.params.periodId)); });
  reopenPeriod = guarded(async (req, res) => { res.json(await ledgerService.reopenPeriod(req.user!, req.params.periodId, ReopenPeriodSchema.parse(req.body).reason)); });

  // journals
  listJournals = guarded(async (req, res) => { res.json(await ledgerService.listJournals(req.user!, JournalListQuerySchema.parse(req.query))); });
  createJournal = guarded(async (req, res) => { res.status(201).json(await ledgerService.createJournal(req.user!, JournalSchema.parse(req.body))); });
  getJournal = guarded(async (req, res) => { res.json(await ledgerService.getJournal(req.user!, req.params.journalId)); });
  updateJournal = guarded(async (req, res) => { res.json(await ledgerService.updateJournal(req.user!, req.params.journalId, JournalSchema.parse(req.body))); });
  deleteJournal = guarded(async (req, res) => { await ledgerService.deleteJournal(req.user!, req.params.journalId); res.status(204).send(); });
  postJournal = guarded(async (req, res) => { res.json(await ledgerService.postJournal(req.user!, req.params.journalId)); });
  reverseJournal = guarded(async (req, res) => { res.status(201).json(await ledgerService.reverseJournal(req.user!, req.params.journalId, ReverseSchema.parse(req.body))); });
  setOpeningBalances = guarded(async (req, res) => { res.status(201).json(await ledgerService.setOpeningBalances(req.user!, OpeningBalanceSchema.parse(req.body))); });
  sync = guarded(async (req, res) => { res.json(await ledgerService.syncSubledgers(req.user!, SyncSchema.parse(req.body ?? {}).preview)); });

  // reports
  trialBalance = guarded(async (req, res) => { res.json(await ledgerService.trialBalance(req.user!, ReportQuerySchema.parse(req.query).asOf)); });
  incomeStatement = guarded(async (req, res) => {
    const { from, to } = ReportQuerySchema.parse(req.query);
    res.json(await ledgerService.incomeStatement(req.user!, from, to));
  });
  balanceSheet = guarded(async (req, res) => { res.json(await ledgerService.balanceSheet(req.user!, ReportQuerySchema.parse(req.query).asOf)); });

  // budgets
  listBudgets = guarded(async (req, res) => { res.json(await budgetService.list(req.user!)); });
  createBudget = guarded(async (req, res) => { res.status(201).json(await budgetService.create(req.user!, CreateBudgetSchema.parse(req.body))); });
  getBudget = guarded(async (req, res) => { res.json(await budgetService.get(req.user!, req.params.budgetId)); });
  updateBudget = guarded(async (req, res) => { res.json(await budgetService.update(req.user!, req.params.budgetId, UpdateBudgetSchema.parse(req.body))); });
  approveBudget = guarded(async (req, res) => { res.json(await budgetService.approve(req.user!, req.params.budgetId)); });
  closeBudget = guarded(async (req, res) => { res.json(await budgetService.close(req.user!, req.params.budgetId)); });
  budgetVersusActual = guarded(async (req, res) => { res.json(await budgetService.versusActual(req.user!, req.params.budgetId)); });

  // funds and receipts
  listFunds = guarded(async (req, res) => { res.json(await fundService.list(req.user!)); });
  createFund = guarded(async (req, res) => { res.status(201).json(await fundService.create(req.user!, CreateFundSchema.parse(req.body))); });
  updateFund = guarded(async (req, res) => { res.json(await fundService.update(req.user!, req.params.fundId, UpdateFundSchema.parse(req.body))); });
  voidReceipt = guarded(async (req, res) => { res.json(await fundService.voidReceipt(req.user!, req.params.receiptId, VoidReceiptSchema.parse(req.body).reason)); });

  // cash sessions
  listCashSessions = guarded(async (req, res) => { res.json(await cashSessionService.list(req.user!)); });
  currentCashSession = guarded(async (req, res) => { res.json(await cashSessionService.current(req.user!)); });
  openCashSession = guarded(async (req, res) => { res.status(201).json(await (() => { const b = OpenCashSessionSchema.parse(req.body); return cashSessionService.open(req.user!, b.openingBalance, b.currency); })()); });
  submitCashSession = guarded(async (req, res) => { res.json(await cashReviewService.submit(req.user!, req.params.sessionId, req.body)); });
  cashReviewQueue = guarded(async (req, res) => { res.json({ sessions: await cashReviewService.queue(req.user!) }); });
  cashSessionDetail = guarded(async (req, res) => { res.json(await cashReviewService.detail(req.user!, req.params.sessionId)); });
  rejectCashSession = guarded(async (req, res) => { res.json(await cashReviewService.reject(req.user!, req.params.sessionId, req.body)); });
  approveCashSession = guarded(async (req, res) => { res.json(await cashReviewService.approve(req.user!, req.params.sessionId, req.body)); });
  recordDeposit = guarded(async (req, res) => {
    const key = req.header('Idempotency-Key')?.trim();
    if (key !== undefined && !/^[A-Za-z0-9_-]{8,100}$/.test(key)) { res.status(400).json({ error: 'Invalid Idempotency-Key header' }); return; }
    const out = await depositService.record(req.user!, req.body, key);
    res.status('replayed' in out ? 200 : 201).json(out);
  });
  listDeposits = guarded(async (req, res) => { res.json({ deposits: await depositService.list(req.user!, typeof req.query.status === 'string' ? req.query.status : undefined) }); });
  verifyDeposit = guarded(async (req, res) => { res.json(await depositService.verify(req.user!, req.params.depositId)); });
  rejectDeposit = guarded(async (req, res) => { res.json(await depositService.reject(req.user!, req.params.depositId, req.body)); });
  startReconciliation = guarded(async (req, res) => { res.status(201).json(await bankReconciliationService.create(req.user!, req.body)); });
  listReconciliations = guarded(async (req, res) => { res.json({ reconciliations: await bankReconciliationService.list(req.user!) }); });
  getReconciliation = guarded(async (req, res) => { res.json(await bankReconciliationService.detail(req.user!, req.params.recId)); });
  importStatement = guarded(async (req, res) => { res.json(await bankReconciliationService.importLines(req.user!, req.params.recId, req.body)); });
  matchLine = guarded(async (req, res) => { res.json(await bankReconciliationService.match(req.user!, req.params.recId, req.body)); });
  unmatchLine = guarded(async (req, res) => { res.json(await bankReconciliationService.unmatch(req.user!, req.params.recId, req.params.lineId)); });
  autoMatch = guarded(async (req, res) => { res.json(await bankReconciliationService.autoMatch(req.user!, req.params.recId)); });
  completeReconciliation = guarded(async (req, res) => { res.json(await bankReconciliationService.complete(req.user!, req.params.recId)); });
  getExpenditurePolicy = guarded(async (req, res) => { res.json(await getPolicy(req.user!.churchId)); });
  setExpenditurePolicy = guarded(async (req, res) => { res.json(await setPolicy(req.user!, req.body)); });
  treasurerOverview = guarded(async (req, res) => { res.json(await depositService.overview(req.user!)); });
  closeCashSession = guarded(async (req, res) => { res.json(await cashSessionService.close(req.user!, req.params.sessionId, CloseCashSessionSchema.parse(req.body))); });
}

export const accountingController = new AccountingController();
