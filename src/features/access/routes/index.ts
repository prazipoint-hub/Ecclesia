import { Router, Response } from 'express';
import { authenticate } from '@/middleware/auth';
import { AuthRequest } from '@/types';
import { ValidationError } from '@/types/errors';
import { handleError } from '@/utils/errorHandler';
import { AssignSchema, assignmentService } from '../service/assignments';

const router = Router();
router.use(authenticate);

const guarded = (fn: (req: AuthRequest, res: Response) => Promise<void>) => async (req: AuthRequest, res: Response) => {
  try { await fn(req, res); } catch (error) { handleError(error, res); }
};

router.get('/me/contexts', guarded(async (req, res) => { res.json({ contexts: await assignmentService.myContexts(req.user!) }); }));

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
