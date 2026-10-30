import { NextFunction, Request, Response, Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/authorization';
import { meetingController as c } from '../controller/meetings';

const router = Router();
router.use(authenticate, (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Fixed "meetings"/"decisions" segments come first so they are not read as committee ids.
router.get('/meetings/:meetingId', authorize('committee:view'), c.get);
router.put('/meetings/:meetingId', authorize('committee:meeting:manage'), c.update);
router.post('/meetings/:meetingId/held', authorize('committee:meeting:manage'), c.markHeld);
router.post('/meetings/:meetingId/cancel', authorize('committee:meeting:manage'), c.cancel);
router.post('/meetings/:meetingId/lock-minutes', authorize('committee:meeting:manage'), c.lockMinutes);
router.post('/meetings/:meetingId/decisions', authorize('committee:meeting:manage'), c.addDecision);
router.put('/decisions/:decisionId', authorize('committee:meeting:manage'), c.updateDecision);
router.delete('/decisions/:decisionId', authorize('committee:meeting:manage'), c.deleteDecision);

router.get('/:committeeId/meetings', authorize('committee:view'), c.list);
router.post('/:committeeId/meetings', authorize('committee:meeting:create'), c.create);

export default router;
