import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { circuitController, hierarchyController } from '../controller';

const router = Router();
router.use(authenticate);
router.get('/me', hierarchyController.getCurrentWorkspace.bind(hierarchyController));
router.get('/churches/:churchId', hierarchyController.getChurchWorkspace.bind(hierarchyController));

router.get('/circuits', circuitController.list);
router.post('/circuits', circuitController.register);
router.put('/circuits/:circuitId/status', circuitController.changeStatus);
router.post('/circuits/:circuitId/secretary-invitation', circuitController.resendSecretaryInvite);
router.get('/circuits/:circuitId/onboarding', circuitController.onboarding);
router.post('/circuits/:circuitId/onboarding/steps/:step/confirm', circuitController.confirmStep);
router.post('/circuits/:circuitId/onboarding/complete', circuitController.completeOnboarding);

export default router;
