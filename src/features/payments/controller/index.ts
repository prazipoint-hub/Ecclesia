import { Response } from 'express';
import { AuthRequest } from '@/types';
import { handleError } from '@/utils/errorHandler';
import { paymentService } from '../service';
import {
  CreatePledgeSchema,
  CreateRecurringSchema,
  CreateSavedMethodSchema,
  InitiatePaymentSchema,
  ListQuerySchema,
} from '../types';

type Handler = (req: AuthRequest, res: Response) => Promise<void>;

/** Wraps a handler with the module's standard error mapping. */
const guarded = (handler: Handler): Handler => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    handleError(error, res);
  }
};

export class PaymentController {
  listFunds = guarded(async (req, res) => {
    res.json(await paymentService.listFunds(req.user!));
  });

  initiate = guarded(async (req, res) => {
    res.status(201).json(await paymentService.initiate(req.user!, InitiatePaymentSchema.parse(req.body)));
  });

  getPayment = guarded(async (req, res) => {
    res.json(await paymentService.getPayment(req.user!, req.params.paymentId));
  });

  listMine = guarded(async (req, res) => {
    res.json(await paymentService.listMine(req.user!, ListQuerySchema.parse(req.query)));
  });

  listAll = guarded(async (req, res) => {
    res.json(await paymentService.listAll(req.user!, ListQuerySchema.parse(req.query)));
  });

  /** Called by the gateway, not by a signed-in user. Rejects anything whose signature does not verify. */
  paynowWebhook = guarded(async (req, res) => {
    await paymentService.handleWebhook(req.body as Record<string, string>);
    res.status(200).send('OK');
  });

  createPledge = guarded(async (req, res) => {
    res.status(201).json(await paymentService.createPledge(req.user!, CreatePledgeSchema.parse(req.body)));
  });

  listPledges = guarded(async (req, res) => {
    res.json(await paymentService.listPledges(req.user!, ListQuerySchema.parse(req.query), 'mine'));
  });

  listAllPledges = guarded(async (req, res) => {
    res.json(await paymentService.listPledges(req.user!, ListQuerySchema.parse(req.query), 'all'));
  });

  getPledge = guarded(async (req, res) => {
    res.json(await paymentService.getPledge(req.user!, req.params.pledgeId));
  });

  cancelPledge = guarded(async (req, res) => {
    res.json(await paymentService.cancelPledge(req.user!, req.params.pledgeId));
  });

  createRecurring = guarded(async (req, res) => {
    res.status(201).json(await paymentService.createRecurring(req.user!, CreateRecurringSchema.parse(req.body)));
  });

  listRecurring = guarded(async (req, res) => {
    res.json(await paymentService.listRecurring(req.user!));
  });

  pauseRecurring = guarded(async (req, res) => {
    res.json(await paymentService.setRecurringActive(req.user!, req.params.recurringId, false));
  });

  resumeRecurring = guarded(async (req, res) => {
    res.json(await paymentService.setRecurringActive(req.user!, req.params.recurringId, true));
  });

  runDueRecurring = guarded(async (req, res) => {
    res.json(await paymentService.runDueRecurring(req.user!));
  });

  listSavedMethods = guarded(async (req, res) => {
    res.json(await paymentService.listSavedMethods(req.user!));
  });

  createSavedMethod = guarded(async (req, res) => {
    res.status(201).json(await paymentService.createSavedMethod(req.user!, CreateSavedMethodSchema.parse(req.body)));
  });

  deleteSavedMethod = guarded(async (req, res) => {
    await paymentService.deleteSavedMethod(req.user!, req.params.methodId);
    res.status(204).send();
  });
}

export const paymentController = new PaymentController();
