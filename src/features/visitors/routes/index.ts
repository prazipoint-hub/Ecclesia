import { NextFunction, Request, Response, Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/authorization';
import { visitorController as c } from '../controller';

const router = Router();
router.use(authenticate, (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

router.get('/', authorize('visitor:view'), c.list);
router.post('/', authorize('visitor:create'), c.create);
router.get('/:visitorId', authorize('visitor:view'), c.get);
router.put('/:visitorId', authorize('visitor:manage'), c.update);
router.post('/:visitorId/follow-ups', authorize('visitor:manage'), c.addFollowUp);
router.post('/:visitorId/convert', authorize('visitor:manage'), c.convert);

export default router;
