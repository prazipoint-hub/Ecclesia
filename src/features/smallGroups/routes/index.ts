import { NextFunction, Request, Response, Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/authorization';
import { smallGroupController as c } from '../controller';

const router = Router();
router.use(authenticate, (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

const view = authorize('group:view');
const manage = authorize('group:manage');
const record = authorize('group:attendance:record');
router.get('/', view, c.list);
router.post('/', manage, c.create);
router.get('/:id', view, c.get);
router.put('/:id', manage, c.update);
router.post('/:id/members', manage, c.addMember);
router.put('/:id/members/:membershipId', manage, c.setMemberRole);
router.delete('/:id/members/:membershipId', manage, c.removeMember);
router.get('/:id/sessions', view, c.listSessions);
router.post('/:id/sessions', record, c.recordSession);
router.get('/:id/sessions/:sessionId', view, c.getSession);
router.put('/:id/sessions/:sessionId/attendance', record, c.setAttendance);
router.get('/:id/attendance-summary', view, c.summary);

export default router;
