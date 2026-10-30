import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { myAccountController as c } from '../controller/myAccount';

const router = Router();

// Every route acts on the caller's own member record; no permission is needed beyond being signed in.
router.use(authenticate);
router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

router.get('/profile', c.getProfile.bind(c));
router.put('/profile', c.updateProfile.bind(c));
router.get('/family', c.getFamily.bind(c));

router.get('/giving', c.listGiving.bind(c));
router.get('/giving/summary', c.getGivingSummary.bind(c));
router.get('/giving/statement', c.downloadStatement.bind(c));

router.get('/notifications', c.listNotifications.bind(c));
router.put('/notifications/read-all', c.markAllNotificationsRead.bind(c));
router.put('/notifications/:notificationId/read', c.markNotificationRead.bind(c));

export default router;
