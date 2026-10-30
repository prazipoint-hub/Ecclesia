import { NextFunction, Request, Response, Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/authorization';
import { leadershipController as c } from '../controller';

const router = Router();
router.use(authenticate, authorize('leadership:term:manage'), (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

router.get('/assignments', c.listAssignments);
router.post('/assignments/:assignmentId/terms', c.startTerm);
router.get('/terms', c.listTerms);
router.put('/terms/:termId/end', c.endTerm);

export default router;
