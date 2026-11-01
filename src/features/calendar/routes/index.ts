import { NextFunction, Request, Response, Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { publicReadLimiter } from '@/middleware/rateLimit';
import { calendarController as c } from '../controller';

const noStore = (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

/** Any signed-in user manages their own links; the calendar content is church-wide event information. */
export const calendarRoutes = Router();
calendarRoutes.use(authenticate, noStore);
calendarRoutes.get('/feeds', c.listFeeds);
calendarRoutes.post('/feeds', c.createFeed);
calendarRoutes.delete('/feeds/:id', c.revokeFeed);

/** Calendar apps cannot send a bearer token, so the secret link itself is the credential. */
export const publicCalendarRoutes = Router();
publicCalendarRoutes.get('/calendar/:token', publicReadLimiter, c.ics);
