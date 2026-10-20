import { Request, Response } from 'express';
import { memberService } from '../service';
import { CreateMemberSchema, UpdateMemberSchema } from '../types';
import { AuthRequest } from '@/types';
import { handleError } from '@/utils/errorHandler';

export class MemberController {
  /**
   * GET /api/v2/members/:id
   */
  async getMember(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const member = await memberService.getMember(id, req.user!);

      if (!member) {
        res.status(404).json({ error: 'Member not found' });
        return;
      }

      res.json(member);
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * GET /api/v2/members
   * List members for church
   */
  async listMembers(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { churchId, sectionId, skip = '0', take = '20' } = req.query;

      if (!churchId || typeof churchId !== 'string') {
        res.status(400).json({ error: 'churchId query parameter required' });
        return;
      }

      const { members, total } = await memberService.listMembers(
        churchId,
        req.user!,
        {
          skip: parseInt(skip as string),
          take: parseInt(take as string),
          sectionId: sectionId as string | undefined,
        }
      );

      res.json({ members, total, skip, take });
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * POST /api/v2/members
   * Create new member
   */
  async createMember(req: AuthRequest, res: Response): Promise<void> {
    try {
      const validated = CreateMemberSchema.parse(req.body);
      const member = await memberService.createMember(validated, req.user!);

      res.status(201).json(member);
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * PUT /api/v2/members/:id
   * Update member
   */
  async updateMember(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const validated = UpdateMemberSchema.parse(req.body);
      const member = await memberService.updateMember(id, validated, req.user!);

      res.json(member);
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * POST /api/v2/members/:id/dependants
   * Add dependent child
   */
  async addDependent(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { firstName, lastName, gender, dateOfBirth } = req.body;

      if (!firstName || !lastName || !gender || !dateOfBirth) {
        res.status(400).json({ error: 'firstName, lastName, gender, dateOfBirth required' });
        return;
      }

      const dependent = await memberService.addDependent(
        id,
        {
          firstName,
          lastName,
          gender,
          dateOfBirth: new Date(dateOfBirth),
        },
        req.user!
      );

      res.status(201).json(dependent);
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * GET /api/v2/members/:id/dependants
   */
  async getDependants(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const dependants = await memberService.getDependants(id, req.user!);

      res.json(dependants);
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * GET /api/v2/churches/:churchId/statistics
   */
  async getChurchStatistics(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { churchId } = req.params;
      const stats = await memberService.getChurchStatistics(churchId, req.user!);

      res.json(stats);
    } catch (error) {
      handleError(error, res);
    }
  }
}

export const memberController = new MemberController();
