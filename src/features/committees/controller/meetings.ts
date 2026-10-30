import { Response } from 'express';
import { AuthRequest } from '@/types';
import { handleError } from '@/utils/errorHandler';
import { meetingService } from '../service/meetings';
import { CreateMeetingSchema, DecisionSchema, MeetingListQuerySchema, UpdateDecisionSchema, UpdateMeetingSchema } from '../types/meetings';

type Handler = (req: AuthRequest, res: Response) => Promise<void>;

const guarded = (handler: Handler): Handler => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    handleError(error, res);
  }
};

export class MeetingController {
  create = guarded(async (req, res) => {
    res.status(201).json(await meetingService.create(req.user!, req.params.committeeId, CreateMeetingSchema.parse(req.body)));
  });

  list = guarded(async (req, res) => {
    res.json(await meetingService.list(req.user!, req.params.committeeId, MeetingListQuerySchema.parse(req.query)));
  });

  get = guarded(async (req, res) => {
    res.json(await meetingService.get(req.user!, req.params.meetingId));
  });

  update = guarded(async (req, res) => {
    res.json(await meetingService.update(req.user!, req.params.meetingId, UpdateMeetingSchema.parse(req.body)));
  });

  markHeld = guarded(async (req, res) => {
    res.json(await meetingService.markHeld(req.user!, req.params.meetingId));
  });

  cancel = guarded(async (req, res) => {
    res.json(await meetingService.cancel(req.user!, req.params.meetingId));
  });

  lockMinutes = guarded(async (req, res) => {
    res.json(await meetingService.lockMinutes(req.user!, req.params.meetingId));
  });

  addDecision = guarded(async (req, res) => {
    res.status(201).json(await meetingService.addDecision(req.user!, req.params.meetingId, DecisionSchema.parse(req.body)));
  });

  updateDecision = guarded(async (req, res) => {
    res.json(await meetingService.updateDecision(req.user!, req.params.decisionId, UpdateDecisionSchema.parse(req.body)));
  });

  deleteDecision = guarded(async (req, res) => {
    await meetingService.deleteDecision(req.user!, req.params.decisionId);
    res.status(204).send();
  });
}

export const meetingController = new MeetingController();
