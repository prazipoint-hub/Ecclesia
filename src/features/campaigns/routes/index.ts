import { NextFunction, Request, Response, Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/authorization';
import { publicReadLimiter } from '@/middleware/rateLimit';
import { campaignController as c } from '../controller';

const noStore = (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

export const campaignRoutes = Router();
campaignRoutes.use(authenticate, noStore);
const manage = authorize('campaign:manage');
campaignRoutes.get('/', manage, c.list);
campaignRoutes.post('/', manage, c.create);
campaignRoutes.get('/:id', manage, c.get);
campaignRoutes.put('/:id', manage, c.update);
campaignRoutes.post('/:id/activate', manage, c.activate);
campaignRoutes.post('/:id/close', manage, c.close);

/** No sign-in: shows goal and progress of public, active campaigns only. */
export const publicCampaignRoutes = Router();
publicCampaignRoutes.get('/campaigns/:slug', publicReadLimiter, c.publicView);
