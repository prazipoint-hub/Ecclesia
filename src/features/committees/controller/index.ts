import { Response } from 'express';
import { AuthRequest } from '@/types';
import { handleError } from '@/utils/errorHandler';
import { CreateCommitteeSchema, UpdateCommitteeSchema } from '../types';
import { committeeService } from '../service';
export class CommitteeController {
  async list(req: AuthRequest, res: Response) { try { res.json(await committeeService.list(req.user!)); } catch (error) { handleError(error, res); } }
  async create(req: AuthRequest, res: Response) { try { res.status(201).json(await committeeService.create(CreateCommitteeSchema.parse(req.body), req.user!)); } catch (error) { handleError(error, res); } }
  async update(req: AuthRequest, res: Response) { try { res.json(await committeeService.update(req.params.committeeId, UpdateCommitteeSchema.parse(req.body), req.user!)); } catch (error) { handleError(error, res); } }
}
export const committeeController = new CommitteeController();
