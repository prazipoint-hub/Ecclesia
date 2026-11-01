import { NextFunction, Request, Response, Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/authorization';
import { assetController as c } from '../controller';

const router = Router();
router.use(authenticate, (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

const view = authorize('asset:view');
const manage = authorize('asset:manage');
router.get('/categories', view, c.categories);
router.post('/categories', manage, c.createCategory);
router.get('/maintenance/due', view, c.due);
router.get('/', view, c.list);
router.post('/', manage, c.create);
router.get('/:id', view, c.get);
router.put('/:id', manage, c.update);
router.post('/:id/retire', manage, c.retire);
router.post('/:id/maintenance', manage, c.recordMaintenance);

export default router;
