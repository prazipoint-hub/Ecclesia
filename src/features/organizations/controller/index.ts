import { Request, Response } from 'express';
import { organizationService } from '../service';
import { CreateOrganizationSchema, CreateOrganizationMembershipSchema, AssignOrganizationRoleSchema } from '../types';
import { AuthRequest } from '@/types';
import { handleError } from '@/utils/errorHandler';

export class OrganizationController {
  /**
   * GET /api/v2/organizations/:id
   */
  async getOrganization(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const org = await organizationService.getOrganization(id, req.user!);

      res.json(org);
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * GET /api/v2/organizations
   */
  async listOrganizations(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { churchId, skip = '0', take = '20' } = req.query;

      if (!churchId || typeof churchId !== 'string') {
        res.status(400).json({ error: 'churchId query parameter required' });
        return;
      }

      const { organizations, total } = await organizationService.listOrganizations(
        churchId,
        req.user!,
        {
          skip: parseInt(skip as string),
          take: parseInt(take as string),
        }
      );

      res.json({ organizations, total, skip, take });
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * POST /api/v2/organizations
   */
  async createOrganization(req: AuthRequest, res: Response): Promise<void> {
    try {
      const validated = CreateOrganizationSchema.parse(req.body);
      const org = await organizationService.createOrganization(validated, req.user!);

      res.status(201).json(org);
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * GET /api/v2/organizations/:id/dashboard
   */
  async getOrganizationDashboard(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const dashboard = await organizationService.getOrganizationDashboard(id, req.user!);

      res.json(dashboard);
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * GET /api/v2/organizations/:id/members
   */
  async getOrganizationMembers(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { skip = '0', take = '20', status } = req.query;

      const members = await organizationService.getOrganizationMembers(id, req.user!, {
        skip: parseInt(skip as string, 10),
        take: parseInt(take as string, 10),
        status: typeof status === 'string' ? status : undefined,
      });

      res.json(members);
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * POST /api/v2/organizations/:id/members
   * Add member to organization
   */
  async addMemberToOrganization(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const validated = CreateOrganizationMembershipSchema.parse({
        ...req.body,
        organizationId: id,
      });

      const membership = await organizationService.addMemberToOrganization(validated, req.user!);

      res.status(201).json(membership);
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * GET /api/v2/members/:memberId/organizations
   * Get all organizations a member belongs to
   */
  async getMemberOrganizations(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { memberId } = req.params;
      const organizations = await organizationService.getMemberOrganizations(memberId, req.user!);

      res.json(organizations);
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * POST /api/v2/organizations/:id/roles
   * Assign leadership role
   */
  async assignOrganizationRole(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const validated = AssignOrganizationRoleSchema.parse({
        ...req.body,
        organizationId: id,
      });

      const assignment = await organizationService.assignOrganizationRole(
        {
          ...validated,
          startDate: validated.startDate ? new Date(validated.startDate) : undefined,
          endDate: validated.endDate ? new Date(validated.endDate) : undefined,
        },
        req.user!
      );

      res.status(201).json(assignment);
    } catch (error) {
      handleError(error, res);
    }
  }
}

export const organizationController = new OrganizationController();
