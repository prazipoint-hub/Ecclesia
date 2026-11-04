import { Response } from 'express';
import { AuthRequest } from '@/types';
import { handleError } from '@/utils/errorHandler';
import { leadershipService } from '../service';
import { AssignmentListQuerySchema, EndTermSchema, StartTermSchema, TermListQuerySchema } from '../types';

type Handler = (req: AuthRequest, res: Response) => Promise<void>;

const guarded = (handler: Handler): Handler => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    handleError(error, res);
  }
};

export class LeadershipController {
  listAssignments = guarded(async (req, res) => {
    res.json(await leadershipService.listAssignments(req.user!, AssignmentListQuerySchema.parse(req.query)));
  });

  startTerm = guarded(async (req, res) => {
    res.status(201).json(await leadershipService.startTerm(req.user!, req.params.assignmentId, StartTermSchema.parse(req.body)));
  });

  endTerm = guarded(async (req, res) => {
    res.json(await leadershipService.endTerm(req.user!, req.params.termId, EndTermSchema.parse(req.body)));
  });

  listTerms = guarded(async (req, res) => {
    res.json(await leadershipService.listTerms(req.user!, TermListQuerySchema.parse(req.query)));
  });
}

export const leadershipController = new LeadershipController();
