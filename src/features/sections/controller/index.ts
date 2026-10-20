import { Request, Response } from 'express';
import { sectionService } from '../service';
import { CreateSectionSchema, AssignSectionLeadershipSchema } from '../types';
import { AuthRequest } from '@/types';
import { handleError } from '@/utils/errorHandler';

export class SectionController {
  /**
   * GET /api/v2/sections/:id
   */
  async getSection(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const section = await sectionService.getSection(id, req.user!);

      if (!section) {
        res.status(404).json({ error: 'Section not found' });
        return;
      }

      res.json(section);
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * GET /api/v2/sections
   */
  async listSections(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { churchId, skip = '0', take = '20' } = req.query;

      if (!churchId || typeof churchId !== 'string') {
        res.status(400).json({ error: 'churchId query parameter required' });
        return;
      }

      const { sections, total } = await sectionService.listSections(
        churchId,
        req.user!,
        {
          skip: parseInt(skip as string),
          take: parseInt(take as string),
        }
      );

      res.json({ sections, total, skip, take });
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * POST /api/v2/sections
   */
  async createSection(req: AuthRequest, res: Response): Promise<void> {
    try {
      const validated = CreateSectionSchema.parse(req.body);
      const section = await sectionService.createSection(validated, req.user!);

      res.status(201).json(section);
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * POST /api/v2/sections/leadership
   */
  async assignLeadership(req: AuthRequest, res: Response): Promise<void> {
    try {
      const validated = AssignSectionLeadershipSchema.parse(req.body);
      const assignment = await sectionService.assignLeadership(
        validated,
        req.user!
      );

      res.status(201).json(assignment);
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * GET /api/v2/sections/:id/members
   */
  async getSectionMembers(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const members = await sectionService.getSectionMembers(id, req.user!);

      res.json(members);
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * GET /api/v2/sections/:id/leadership
   */
  async getSectionLeadership(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const leadership = await sectionService.getSectionLeadership(id, req.user!);

      res.json(leadership);
    } catch (error) {
      handleError(error, res);
    }
  }
}

export const sectionController = new SectionController();
