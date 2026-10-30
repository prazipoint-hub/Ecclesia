import express, { NextFunction, Request, Response, Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/authorization';
import { directoryController as c } from '../controller/directory';

const router = Router();
router.use(authenticate, (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Mounted ahead of the legacy member routes so these fixed paths are not read as member ids.
router.get('/search', authorize('member:view'), c.search);
router.get('/export', authorize('member:export'), c.exportCsv);

const csv = express.text({ type: ['text/csv', 'text/plain'], limit: '5mb' });
router.post('/import/preview', authorize('member:import'), csv, c.previewImport);
router.post('/import', authorize('member:import'), csv, c.runImport);
router.get('/imports', authorize('member:import'), c.listImports);

router.put('/:id/archive', authorize('member:archive'), c.archive);
router.put('/:id/restore', authorize('member:archive'), c.restore);

export default router;
