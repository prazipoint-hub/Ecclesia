import { Router, Response } from 'express';
import { authenticate } from '@/middleware/auth';
import { AuthRequest } from '@/types';
import { ValidationError } from '@/types/errors';
import { handleError } from '@/utils/errorHandler';
import { AssignSchema, assignmentService } from '../service/assignments';
import { accessDirectoryService as dir } from '../service/directory';
import { previewService } from '../service/preview';

const router = Router();
router.use(authenticate);

const guarded = (fn: (req: AuthRequest, res: Response) => Promise<void>) => async (req: AuthRequest, res: Response) => {
  try { await fn(req, res); } catch (error) { handleError(error, res); }
};

router.get('/me/contexts', guarded(async (req, res) => { res.json({ contexts: await assignmentService.myContexts(req.user!) }); }));

router.post('/context/verify', guarded(async (req, res) => { res.json(await previewService.verifyContext(req.user!, req.body)); }));
router.post('/preview', guarded(async (req, res) => { res.status(201).json(await previewService.start(req.user!, req.sessionId, req.body)); }));
router.post('/preview/exit', guarded(async (req, res) => { res.json(await previewService.exit(req.user!)); }));

router.get('/assignments', guarded(async (req, res) => { res.json({ assignments: await dir.list(req.user!, req.query) }); }));
router.get('/assignable-roles', guarded(async (req, res) => { res.json({ roles: await dir.assignableRoles(req.user!, req.query) }); }));
router.get('/users', guarded(async (req, res) => { res.json({ users: await dir.findUsers(req.user!, req.query) }); }));
router.post('/assignments', guarded(async (req, res) => {
  const body = AssignSchema.safeParse(req.body);
  if (!body.success) throw new ValidationError(body.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  const result = await assignmentService.assign(req.user!, body.data);
  res.status(result.created ? 201 : 200).json(result);
}));

router.delete('/assignments/:id', guarded(async (req, res) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 500) : undefined;
  res.json(await assignmentService.revoke(req.user!, req.params.id, reason));
}));

export default router;
