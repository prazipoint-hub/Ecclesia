import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/authorization';
import { pastoralCaseController } from '../controller';

const router = Router();
router.use(authenticate);

router.get('/', authorize('pastoral:case:view'), pastoralCaseController.list.bind(pastoralCaseController));
router.post('/', authorize('pastoral:case:create'), pastoralCaseController.create.bind(pastoralCaseController));
router.get('/:caseId', authorize('pastoral:case:view'), pastoralCaseController.get.bind(pastoralCaseController));
router.put('/:caseId', authorize('pastoral:case:update'), pastoralCaseController.update.bind(pastoralCaseController));
router.post('/:caseId/close', authorize('pastoral:case:close'), pastoralCaseController.close.bind(pastoralCaseController));
router.post('/:caseId/activities', authorize('pastoral:case:update'), pastoralCaseController.addActivity.bind(pastoralCaseController));
router.get('/:caseId/timeline', authorize('pastoral:case:view'), pastoralCaseController.timeline.bind(pastoralCaseController));

export default router;
