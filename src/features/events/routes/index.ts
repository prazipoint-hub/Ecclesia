import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/authorization';
import { eventController } from '../controller';

const router = Router();
router.use(authenticate);
router.get('/', authorize('event:view'), eventController.list.bind(eventController));
router.post('/', authorize('event:create'), eventController.create.bind(eventController));
router.get('/:eventId', authorize('event:view'), eventController.get.bind(eventController));
router.put('/:eventId', authorize('event:update'), eventController.update.bind(eventController));
router.get('/:eventId/attendance', authorize('event:view'), eventController.listAttendance.bind(eventController));
router.post('/:eventId/attendance', authorize('event:attendance:record'), eventController.recordAttendance.bind(eventController));
export default router;
