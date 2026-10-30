import { NextFunction, Request, Response, Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/authorization';
import { notificationController as c } from '../controller';

const router = Router();
router.use(authenticate, (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// A member's own preferences and devices: signed in is enough.
router.get('/preferences', c.getPreferences);
router.put('/preferences', c.updatePreferences);
router.post('/push-subscriptions', c.subscribePush);
router.delete('/push-subscriptions', c.unsubscribePush);

router.get('/templates', authorize('notification:template:manage'), c.listTemplates);
router.post('/templates', authorize('notification:template:manage'), c.createTemplate);
router.put('/templates/:templateId', authorize('notification:template:manage'), c.updateTemplate);
router.delete('/templates/:templateId', authorize('notification:template:manage'), c.deleteTemplate);

router.post('/broadcasts/audience-preview', authorize('notification:broadcast:create'), c.previewAudience);
router.post('/broadcasts/run-due', authorize('notification:broadcast:send'), c.runDue);
router.get('/broadcasts', authorize('notification:broadcast:create'), c.listBroadcasts);
router.post('/broadcasts', authorize('notification:broadcast:create'), c.createBroadcast);
router.get('/broadcasts/:broadcastId', authorize('notification:broadcast:create'), c.getBroadcast);
router.put('/broadcasts/:broadcastId', authorize('notification:broadcast:create'), c.updateBroadcast);
router.post('/broadcasts/:broadcastId/send', authorize('notification:broadcast:send'), c.sendBroadcast);
router.post('/broadcasts/:broadcastId/schedule', authorize('notification:broadcast:send'), c.scheduleBroadcast);
router.post('/broadcasts/:broadcastId/cancel', authorize('notification:broadcast:send'), c.cancelBroadcast);

export default router;
