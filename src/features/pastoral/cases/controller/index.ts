import { Response } from 'express';
import { AuthRequest } from '@/types';
import { handleError } from '@/utils/errorHandler';
import {
  AddCaseActivitySchema,
  ClosePastoralCaseSchema,
  CreatePastoralCaseSchema,
  UpdatePastoralCaseSchema,
} from '../../types';
import { pastoralCaseService } from '../service';

const pageNumber = (value: unknown, fallback: number, maximum: number): number => {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : fallback;
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), maximum) : fallback;
};

export class PastoralCaseController {
  async list(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { status, priority, memberId, assignedPastorId } = req.query;
      const result = await pastoralCaseService.list(
        {
          ...(typeof status === 'string' ? { status } : {}),
          ...(typeof priority === 'string' ? { priority } : {}),
          ...(typeof memberId === 'string' ? { memberId } : {}),
          ...(typeof assignedPastorId === 'string' ? { assignedPastorId } : {}),
          skip: pageNumber(req.query.skip, 0, 100_000),
          take: pageNumber(req.query.take, 20, 100),
        },
        req.user!
      );
      res.json(result);
    } catch (error) {
      handleError(error, res);
    }
  }

  async get(req: AuthRequest, res: Response): Promise<void> {
    try {
      res.json(await pastoralCaseService.get(req.params.caseId, req.user!));
    } catch (error) {
      handleError(error, res);
    }
  }

  async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      const input = CreatePastoralCaseSchema.parse(req.body);
      res.status(201).json(await pastoralCaseService.create(input, req.user!));
    } catch (error) {
      handleError(error, res);
    }
  }

  async update(req: AuthRequest, res: Response): Promise<void> {
    try {
      const input = UpdatePastoralCaseSchema.parse(req.body);
      res.json(await pastoralCaseService.update(req.params.caseId, input, req.user!));
    } catch (error) {
      handleError(error, res);
    }
  }

  async close(req: AuthRequest, res: Response): Promise<void> {
    try {
      const input = ClosePastoralCaseSchema.parse(req.body);
      res.json(await pastoralCaseService.close(req.params.caseId, input.resolvedReason, req.user!));
    } catch (error) {
      handleError(error, res);
    }
  }

  async addActivity(req: AuthRequest, res: Response): Promise<void> {
    try {
      const input = AddCaseActivitySchema.parse(req.body);
      res.status(201).json(await pastoralCaseService.addActivity(req.params.caseId, input, req.user!));
    } catch (error) {
      handleError(error, res);
    }
  }

  async timeline(req: AuthRequest, res: Response): Promise<void> {
    try {
      res.json(await pastoralCaseService.timeline(req.params.caseId, req.user!));
    } catch (error) {
      handleError(error, res);
    }
  }
}

export const pastoralCaseController = new PastoralCaseController();
