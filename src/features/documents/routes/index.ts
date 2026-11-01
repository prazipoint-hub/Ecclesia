import { NextFunction, Request, Response, Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/authorization';
import { documentController as c } from '../controller';

const router = Router();
router.use(authenticate, (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

const view = authorize('document:view');
const manage = authorize('document:template:manage');
router.get('/templates', view, c.templates);
router.post('/templates', manage, c.createTemplate);
router.put('/templates/:id', manage, c.updateTemplate);
router.post('/generate', authorize('document:generate'), c.generate);
router.get('/', view, c.list);
router.get('/:id', view, c.get);
router.get('/:id/pdf', view, c.pdf);
router.post('/:id/void', authorize('document:generate'), c.void);

export default router;
