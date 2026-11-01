import { Response } from 'express';
import { AuthRequest } from '@/types';
import { handleError } from '@/utils/errorHandler';
import { absenceFollowUpService } from '../service/absences';
import { attendanceAnalyticsService } from '../service/analytics';
import { checkInService } from '../service/checkin';
import { registrationService } from '../service/registration';
import { volunteerService } from '../service/volunteers';
import * as T from '../types/engagement';

type Handler = (req: AuthRequest, res: Response) => Promise<void>;

const guarded = (handler: Handler): Handler => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    handleError(error, res);
  }
};

const paging = T.CheckInListQuerySchema;

export class EventEngagementController {
  // QR + check-in
  eventQr = guarded(async (req, res) => { res.json(await checkInService.eventQr(req.user!, req.params.eventId)); });
  myBadge = guarded(async (req, res) => { res.json(await checkInService.myBadge(req.user!)); });
  selfCheckIn = guarded(async (req, res) => { res.json(await checkInService.selfCheckIn(req.user!, T.SelfCheckInSchema.parse(req.body).token)); });
  scanBadge = guarded(async (req, res) => { res.json(await checkInService.scanBadge(req.user!, req.params.eventId, T.ScanBadgeSchema.parse(req.body).token)); });
  manualCheckIn = guarded(async (req, res) => { res.json(await checkInService.manual(req.user!, req.params.eventId, T.ManualCheckInSchema.parse(req.body))); });
  listCheckIns = guarded(async (req, res) => { res.json(await checkInService.list(req.user!, req.params.eventId, paging.parse(req.query))); });

  // registration
  upcoming = guarded(async (req, res) => { res.json(await registrationService.upcoming(req.user!)); });
  registerSelf = guarded(async (req, res) => { res.status(201).json(await registrationService.registerSelf(req.user!, req.params.eventId)); });
  cancelSelf = guarded(async (req, res) => { res.json(await registrationService.cancelSelf(req.user!, req.params.eventId)); });
  listRegistrations = guarded(async (req, res) => { res.json(await registrationService.list(req.user!, req.params.eventId, T.RegistrationListQuerySchema.parse(req.query))); });
  registerByStaff = guarded(async (req, res) => { res.status(201).json(await registrationService.registerByStaff(req.user!, req.params.eventId, T.StaffRegistrationSchema.parse(req.body))); });
  cancelByStaff = guarded(async (req, res) => { res.json(await registrationService.cancelByStaff(req.user!, req.params.eventId, req.params.registrationId)); });

  // volunteers
  listVolunteers = guarded(async (req, res) => { res.json(await volunteerService.list(req.user!, T.VolunteerListQuerySchema.parse(req.query))); });
  myVolunteering = guarded(async (req, res) => { res.json(await volunteerService.mine(req.user!, paging.parse(req.query))); });
  assignVolunteer = guarded(async (req, res) => { res.status(201).json(await volunteerService.assign(req.user!, T.CreateVolunteerSchema.parse(req.body))); });
  updateVolunteer = guarded(async (req, res) => { res.json(await volunteerService.update(req.user!, req.params.id, T.UpdateVolunteerSchema.parse(req.body))); });
  respondVolunteer = guarded(async (req, res) => { res.json(await volunteerService.respond(req.user!, req.params.id, T.RespondVolunteerSchema.parse(req.body).response)); });

  // analytics + absences
  attendanceAnalytics = guarded(async (req, res) => { res.json(await attendanceAnalyticsService.attendance(req.user!, T.AnalyticsQuerySchema.parse(req.query))); });
  detectAbsences = guarded(async (req, res) => { res.json(await absenceFollowUpService.detect(req.user!, T.DetectAbsencesSchema.parse(req.body ?? {}))); });
  listAbsences = guarded(async (req, res) => { res.json(await absenceFollowUpService.list(req.user!, T.AbsenceListQuerySchema.parse(req.query))); });
  assignAbsence = guarded(async (req, res) => { res.json(await absenceFollowUpService.assign(req.user!, req.params.id, T.AssignAbsenceSchema.parse(req.body).assignedTo)); });
  updateAbsence = guarded(async (req, res) => { res.json(await absenceFollowUpService.update(req.user!, req.params.id, T.UpdateAbsenceSchema.parse(req.body))); });
}

export const eventEngagementController = new EventEngagementController();
