import { NextFunction, Request, Response, Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/authorization';
import { pastoralCareController as c } from '../controller';

const router = Router();
router.use(authenticate, (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

router.get('/dashboard', authorize('pastoral:dashboard:view'), c.dashboard);
router.get('/members/:memberId/care-profile', authorize('pastoral:case:view'), c.careProfile);

router.get('/visits', authorize('pastoral:visit:view'), c.listVisits);
router.post('/visits', authorize('pastoral:visit:create'), c.createVisit);
router.get('/visits/:id', authorize('pastoral:visit:view'), c.getVisit);
router.put('/visits/:id', authorize('pastoral:visit:update'), c.updateVisit);

router.get('/counseling', authorize('pastoral:counseling:view'), c.listCounseling);
router.post('/counseling', authorize('pastoral:counseling:create'), c.createCounseling);
router.get('/counseling/:id', authorize('pastoral:counseling:view'), c.getCounseling);
router.put('/counseling/:id', authorize('pastoral:counseling:update'), c.updateCounseling);

// Any signed-in member can ask for prayer and see their own requests and the church-wide wall.
router.post('/prayer', c.submitPrayer);
router.get('/prayer/mine', c.myPrayer);
router.get('/prayer/wall', c.prayerWall);
router.get('/prayer', authorize('pastoral:prayer:view'), c.listPrayer);
router.get('/prayer/:id', c.getPrayer); // owner, or prayer:view (checked in the service)
router.put('/prayer/:id/status', authorize('pastoral:prayer:manage'), c.updatePrayerStatus);

router.get('/referrals', authorize('pastoral:referral:view'), c.listReferrals);
router.post('/referrals', authorize('pastoral:referral:create'), c.createReferral);
router.get('/referrals/:id', authorize('pastoral:referral:view'), c.getReferral);
router.put('/referrals/:id', authorize('pastoral:referral:update'), c.updateReferral);

router.get('/followups', authorize('pastoral:followup:view'), c.listFollowUps);
router.post('/followups', authorize('pastoral:followup:manage'), c.createFollowUp);
router.post('/followups/:id/complete', authorize('pastoral:followup:manage'), c.completeFollowUp);
router.post('/followups/:id/cancel', authorize('pastoral:followup:manage'), c.cancelFollowUp);

router.get('/assessments', authorize('pastoral:assessment:view'), c.listAssessments);
router.post('/assessments', authorize('pastoral:assessment:update'), c.createAssessment);

const sacrament = authorize('pastoral:sacrament:manage');
router.get('/sacraments/baptisms', sacrament, c.listBaptisms);
router.post('/sacraments/baptisms', sacrament, c.createBaptism);
router.put('/sacraments/baptisms/:id', sacrament, c.advanceBaptism);
router.get('/sacraments/confirmations', sacrament, c.listConfirmations);
router.post('/sacraments/confirmations', sacrament, c.createConfirmation);
router.put('/sacraments/confirmations/:id', sacrament, c.advanceConfirmation);
router.get('/sacraments/marriages', sacrament, c.listMarriages);
router.post('/sacraments/marriages', sacrament, c.createMarriage);
router.put('/sacraments/marriages/:id', sacrament, c.advanceMarriage);
router.get('/sacraments/funerals', sacrament, c.listFunerals);
router.post('/sacraments/funerals', sacrament, c.createFuneral);
router.put('/sacraments/funerals/:id', sacrament, c.updateFuneral);

export default router;
