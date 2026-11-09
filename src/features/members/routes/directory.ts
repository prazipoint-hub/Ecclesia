import express, { NextFunction, Request, Response, Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/authorization';
import { directoryController as c, importJobController as ij } from '../controller/directory';

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

// Staged, reviewable import (template v1). The three routes above stay for existing clients.
const j = authorize('member:import');
router.get('/import-jobs/template', j, ij.templateCsv);
router.get('/import-jobs/template/spec', j, ij.templateSpec);
router.post('/import-jobs', j, csv, ij.stage);
router.get('/import-jobs/:jobId', j, ij.get);
router.get('/import-jobs/:jobId/rows', j, ij.rows);
router.get('/import-jobs/:jobId/problems.csv', j, ij.problems);
router.put('/import-jobs/:jobId/decisions', j, ij.decide);
router.post('/import-jobs/:jobId/confirm', j, ij.confirm);
router.post('/import-jobs/:jobId/cancel', j, ij.cancel);

router.put('/:id/archive', authorize('member:archive'), c.archive);
router.put('/:id/restore', authorize('member:archive'), c.restore);

export default router;
