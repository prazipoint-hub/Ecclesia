import { Request, Response } from 'express';
import { familyService } from '../service';
import { CreateFamilySchema, AddFamilyMemberSchema } from '../types';
import { AuthRequest } from '@/types';
import { handleError } from '@/utils/errorHandler';

export class FamilyController {
  /**
   * GET /api/v2/families/:id
   */
  async getFamily(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const family = await familyService.getFamily(id, req.user!);

      if (!family) {
        res.status(404).json({ error: 'Family not found' });
        return;
      }

      res.json(family);
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * GET /api/v2/families
   */
  async listFamilies(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { churchId, sectionId, skip = '0', take = '20' } = req.query;

      if (!churchId || typeof churchId !== 'string') {
        res.status(400).json({ error: 'churchId query parameter required' });
        return;
      }

      const { families, total } = await familyService.listFamilies(
        churchId,
        req.user!,
        {
          skip: parseInt(skip as string),
          take: parseInt(take as string),
          sectionId: sectionId as string | undefined,
        }
      );

      res.json({ families, total, skip, take });
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * POST /api/v2/families
   */
  async createFamily(req: AuthRequest, res: Response): Promise<void> {
    try {
      const validated = CreateFamilySchema.parse(req.body);
      const family = await familyService.createFamily(validated, req.user!);

      res.status(201).json(family);
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * GET /api/v2/families/:id/members
   */
  async getFamilyMembers(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const members = await familyService.getFamilyMembers(id, req.user!);

      res.json(members);
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * POST /api/v2/families/:id/members
   */
  async addMemberToFamily(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const validated = AddFamilyMemberSchema.parse(req.body);

      const relationship = await familyService.addMemberToFamily(
        id,
        validated.memberId,
        validated.relationshipType,
        req.user!
      );

      res.status(201).json(relationship);
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * GET /api/v2/members/:memberId/families
   */
  async getMemberFamilies(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { memberId } = req.params;
      const families = await familyService.getMemberFamilies(memberId, req.user!);

      res.json(families);
    } catch (error) {
      handleError(error, res);
    }
  }
}

export const familyController = new FamilyController();
