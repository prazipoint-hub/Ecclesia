import { NextFunction, Request, Response, Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/authorization';
import { eventEngagementController as c } from '../controller/engagement';

/** Mounted before the core events router so these fixed paths are never read as an event id. */
const router = Router();
router.use(authenticate, (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Any signed-in member
router.get('/upcoming', c.upcoming);
router.get('/members/me/badge', c.myBadge);
router.post('/checkin/self', c.selfCheckIn);
router.get('/volunteers/mine', c.myVolunteering);
router.post('/volunteers/:id/respond', c.respondVolunteer);
router.post('/:eventId/register', c.registerSelf);
router.delete('/:eventId/register', c.cancelSelf);

// Staff
router.get('/analytics/attendance', authorize('attendance:analytics:view'), c.attendanceAnalytics);

router.get('/volunteers', authorize('volunteer:schedule:view'), c.listVolunteers);
router.post('/volunteers', authorize('volunteer:schedule:manage'), c.assignVolunteer);
router.put('/volunteers/:id', authorize('volunteer:schedule:manage'), c.updateVolunteer);

router.get('/absences', authorize('absence:followup:manage'), c.listAbsences);
router.post('/absences/detect', authorize('absence:followup:manage'), c.detectAbsences);
router.put('/absences/:id/assign', authorize('absence:followup:manage'), c.assignAbsence);
router.put('/absences/:id', authorize('absence:followup:manage'), c.updateAbsence);

router.get('/:eventId/qr', authorize('event:qr:generate'), c.eventQr);
router.get('/:eventId/checkins', authorize('event:checkin:manage'), c.listCheckIns);
router.post('/:eventId/checkin', authorize('event:checkin:manage'), c.manualCheckIn);
router.post('/:eventId/checkin/scan', authorize('event:checkin:manage'), c.scanBadge);
router.get('/:eventId/registrations', authorize('event:registration:manage'), c.listRegistrations);
router.post('/:eventId/registrations', authorize('event:registration:manage'), c.registerByStaff);
router.delete('/:eventId/registrations/:registrationId', authorize('event:registration:manage'), c.cancelByStaff);

export default router;
