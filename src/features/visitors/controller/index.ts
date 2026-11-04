import { Response } from 'express';
import { AuthRequest } from '@/types';
import { handleError } from '@/utils/errorHandler';
import { visitorService } from '../service';
import { ConvertSchema, CreateVisitorSchema, FollowUpSchema, UpdateVisitorSchema, VisitorListQuerySchema } from '../types';

type Handler = (req: AuthRequest, res: Response) => Promise<void>;

const guarded = (handler: Handler): Handler => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    handleError(error, res);
  }
};

export class VisitorController {
  create = guarded(async (req, res) => {
    res.status(201).json(await visitorService.create(req.user!, CreateVisitorSchema.parse(req.body)));
  });

  list = guarded(async (req, res) => {
    res.json(await visitorService.list(req.user!, VisitorListQuerySchema.parse(req.query)));
  });

  get = guarded(async (req, res) => {
    res.json(await visitorService.get(req.user!, req.params.visitorId));
  });

  update = guarded(async (req, res) => {
    res.json(await visitorService.update(req.user!, req.params.visitorId, UpdateVisitorSchema.parse(req.body)));
  });

  addFollowUp = guarded(async (req, res) => {
    res.status(201).json(await visitorService.addFollowUp(req.user!, req.params.visitorId, FollowUpSchema.parse(req.body)));
  });

  convert = guarded(async (req, res) => {
    res.status(201).json(await visitorService.convert(req.user!, req.params.visitorId, ConvertSchema.parse(req.body)));
  });
}

export const visitorController = new VisitorController();
