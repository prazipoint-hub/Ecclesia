import { NextFunction, Request, Response, Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/authorization';
import { paymentInitiateLimiter } from '@/middleware/rateLimit';
import { paymentController as c } from '../controller';

const noStore = (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

// Own-record routes need a signed-in member and nothing more; staff views are permission-gated.

export const paymentRoutes = Router();
// Unauthenticated on purpose: authenticity comes from the gateway's signature, checked in the service.
paymentRoutes.post('/webhook/paynow', c.paynowWebhook);
paymentRoutes.use(authenticate, noStore);
paymentRoutes.get('/funds', c.listFunds);
paymentRoutes.post('/initiate', paymentInitiateLimiter, c.initiate);
paymentRoutes.get('/mine', c.listMine);
paymentRoutes.get('/all', authorize('payment:view:all'), c.listAll);
paymentRoutes.get('/:paymentId', c.getPayment);

export const pledgeRoutes = Router();
pledgeRoutes.use(authenticate, noStore);
pledgeRoutes.post('/', c.createPledge);
pledgeRoutes.get('/', c.listPledges);
pledgeRoutes.get('/all', authorize('pledge:view:all'), c.listAllPledges);
pledgeRoutes.get('/:pledgeId', c.getPledge);
pledgeRoutes.put('/:pledgeId/cancel', c.cancelPledge);

export const recurringGivingRoutes = Router();
recurringGivingRoutes.use(authenticate, noStore);
recurringGivingRoutes.post('/', c.createRecurring);
recurringGivingRoutes.get('/', c.listRecurring);
recurringGivingRoutes.post('/run-due', authorize('recurring:manage'), c.runDueRecurring);
recurringGivingRoutes.put('/:recurringId/pause', c.pauseRecurring);
recurringGivingRoutes.put('/:recurringId/resume', c.resumeRecurring);

export const paymentMethodRoutes = Router();
paymentMethodRoutes.use(authenticate, noStore);
paymentMethodRoutes.get('/', c.listSavedMethods);
paymentMethodRoutes.post('/', c.createSavedMethod);
paymentMethodRoutes.delete('/:methodId', c.deleteSavedMethod);
