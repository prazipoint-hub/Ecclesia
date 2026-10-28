import { Response } from 'express';
import { AuthRequest } from '@/types';
import { handleError } from '@/utils/errorHandler';
import { hierarchyService } from '../service';

export class HierarchyController {
  async getCurrentWorkspace(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.churchId) {
        res.status(400).json({ error: 'An assigned church is required to load a workspace' });
        return;
      }
      res.json(await hierarchyService.getWorkspace(req.user.churchId, req.user));
    } catch (error) {
      handleError(error, res);
    }
  }

  async getChurchWorkspace(req: AuthRequest, res: Response): Promise<void> {
    try {
      res.json(await hierarchyService.getWorkspace(req.params.churchId, req.user!));
    } catch (error) {
      handleError(error, res);
    }
  }
}

export const hierarchyController = new HierarchyController();
