import { Response } from 'express';
import { AuthRequest } from '@/types';
import { handleError } from '@/utils/errorHandler';
import { assessmentService } from '../service/assessments';
import { counselingService } from '../service/counseling';
import { pastoralDashboardService } from '../service/dashboard';
import { followUpService } from '../service/followups';
import { prayerService } from '../service/prayer';
import { referralService } from '../service/referrals';
import { sacramentService } from '../service/sacraments';
import { pastoralVisitService } from '../service/visits';
import * as T from '../types';

type Handler = (req: AuthRequest, res: Response) => Promise<void>;

const guarded = (handler: Handler): Handler => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    handleError(error, res);
  }
};

const paging = T.VisitListQuerySchema.pick({ skip: true, take: true });

export class PastoralCareController {
  // visits
  listVisits = guarded(async (req, res) => { res.json(await pastoralVisitService.list(req.user!, T.VisitListQuerySchema.parse(req.query))); });
  getVisit = guarded(async (req, res) => { res.json(await pastoralVisitService.get(req.user!, req.params.id)); });
  createVisit = guarded(async (req, res) => { res.status(201).json(await pastoralVisitService.create(req.user!, T.CreateVisitSchema.parse(req.body))); });
  updateVisit = guarded(async (req, res) => { res.json(await pastoralVisitService.update(req.user!, req.params.id, T.UpdateVisitSchema.parse(req.body))); });

  // counseling
  listCounseling = guarded(async (req, res) => { res.json(await counselingService.list(req.user!, T.CounselingListQuerySchema.parse(req.query))); });
  getCounseling = guarded(async (req, res) => { res.json(await counselingService.get(req.user!, req.params.id)); });
  createCounseling = guarded(async (req, res) => { res.status(201).json(await counselingService.create(req.user!, T.CreateCounselingSchema.parse(req.body))); });
  updateCounseling = guarded(async (req, res) => { res.json(await counselingService.update(req.user!, req.params.id, T.UpdateCounselingSchema.parse(req.body))); });

  // prayer
  submitPrayer = guarded(async (req, res) => { res.status(201).json(await prayerService.submit(req.user!, T.SubmitPrayerSchema.parse(req.body))); });
  myPrayer = guarded(async (req, res) => { res.json(await prayerService.mine(req.user!, paging.parse(req.query))); });
  prayerWall = guarded(async (req, res) => { res.json(await prayerService.wall(req.user!, paging.parse(req.query))); });
  listPrayer = guarded(async (req, res) => { res.json(await prayerService.list(req.user!, T.PrayerListQuerySchema.parse(req.query))); });
  getPrayer = guarded(async (req, res) => {
    res.json(await prayerService.get(req.user!, req.params.id, T.PrayerDetailQuerySchema.parse(req.query).justification));
  });
  updatePrayerStatus = guarded(async (req, res) => { res.json(await prayerService.updateStatus(req.user!, req.params.id, T.UpdatePrayerSchema.parse(req.body))); });

  // referrals
  listReferrals = guarded(async (req, res) => { res.json(await referralService.list(req.user!, T.ReferralListQuerySchema.parse(req.query))); });
  getReferral = guarded(async (req, res) => { res.json(await referralService.get(req.user!, req.params.id)); });
  createReferral = guarded(async (req, res) => { res.status(201).json(await referralService.create(req.user!, T.CreateReferralSchema.parse(req.body))); });
  updateReferral = guarded(async (req, res) => { res.json(await referralService.update(req.user!, req.params.id, T.UpdateReferralSchema.parse(req.body))); });

  // follow-ups
  listFollowUps = guarded(async (req, res) => { res.json(await followUpService.list(req.user!, T.FollowUpListQuerySchema.parse(req.query))); });
  createFollowUp = guarded(async (req, res) => { res.status(201).json(await followUpService.create(req.user!, T.CreateFollowUpSchema.parse(req.body))); });
  completeFollowUp = guarded(async (req, res) => { res.json(await followUpService.complete(req.user!, req.params.id, T.CompleteFollowUpSchema.parse(req.body ?? {}).notes)); });
  cancelFollowUp = guarded(async (req, res) => { res.json(await followUpService.cancel(req.user!, req.params.id, T.CompleteFollowUpSchema.parse(req.body ?? {}).notes)); });

  // assessments
  listAssessments = guarded(async (req, res) => { res.json(await assessmentService.list(req.user!, T.AssessmentListQuerySchema.parse(req.query))); });
  createAssessment = guarded(async (req, res) => { res.status(201).json(await assessmentService.create(req.user!, T.CreateAssessmentSchema.parse(req.body))); });

  // sacraments
  listBaptisms = guarded(async (req, res) => { res.json(await sacramentService.listBaptisms(req.user!, T.SacramentListQuerySchema.parse(req.query))); });
  createBaptism = guarded(async (req, res) => { res.status(201).json(await sacramentService.createBaptism(req.user!, T.CreateBaptismSchema.parse(req.body))); });
  advanceBaptism = guarded(async (req, res) => { res.json(await sacramentService.advanceBaptism(req.user!, req.params.id, T.AdvanceBaptismSchema.parse(req.body))); });
  listConfirmations = guarded(async (req, res) => { res.json(await sacramentService.listConfirmations(req.user!, T.SacramentListQuerySchema.parse(req.query))); });
  createConfirmation = guarded(async (req, res) => { res.status(201).json(await sacramentService.createConfirmation(req.user!, T.CreateConfirmationSchema.parse(req.body))); });
  advanceConfirmation = guarded(async (req, res) => { res.json(await sacramentService.advanceConfirmation(req.user!, req.params.id, T.AdvanceConfirmationSchema.parse(req.body))); });
  listMarriages = guarded(async (req, res) => { res.json(await sacramentService.listMarriages(req.user!, T.SacramentListQuerySchema.parse(req.query))); });
  createMarriage = guarded(async (req, res) => { res.status(201).json(await sacramentService.createMarriage(req.user!, T.CreateMarriageSchema.parse(req.body))); });
  advanceMarriage = guarded(async (req, res) => { res.json(await sacramentService.advanceMarriage(req.user!, req.params.id, T.AdvanceMarriageSchema.parse(req.body))); });
  listFunerals = guarded(async (req, res) => { res.json(await sacramentService.listFunerals(req.user!, T.SacramentListQuerySchema.parse(req.query))); });
  createFuneral = guarded(async (req, res) => { res.status(201).json(await sacramentService.createFuneral(req.user!, T.CreateFuneralSchema.parse(req.body))); });
  updateFuneral = guarded(async (req, res) => { res.json(await sacramentService.updateFuneral(req.user!, req.params.id, T.UpdateFuneralSchema.parse(req.body))); });

  // dashboard + member profile
  dashboard = guarded(async (req, res) => { res.json(await pastoralDashboardService.overview(req.user!)); });
  careProfile = guarded(async (req, res) => { res.json(await pastoralDashboardService.careProfile(req.user!, req.params.memberId)); });
}

export const pastoralCareController = new PastoralCareController();
