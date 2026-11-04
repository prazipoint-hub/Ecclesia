import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { hierarchyController } from '../controller';

const router = Router();
router.use(authenticate);
router.get('/me', hierarchyController.getCurrentWorkspace.bind(hierarchyController));
router.get('/churches/:churchId', hierarchyController.getChurchWorkspace.bind(hierarchyController));

export default router;
