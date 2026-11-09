import { Response } from 'express';
import { AuthRequest } from '@/types';
import { handleError } from '@/utils/errorHandler';
import { z } from 'zod';
import { hierarchyService } from '../service';
import { onboardingService } from '../service/onboarding';
import { circuitService } from '../service/circuit';
import { CircuitStatusSchema, IdempotencyKeySchema, RegisterCircuitSchema } from '../types/circuit';
import { ValidationError } from '@/types/errors';

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

const ListQuery = z.object({ districtId: z.string().min(1).optional(), take: z.coerce.number().int().min(1).max(100).default(25), skip: z.coerce.number().int().min(0).default(0) });

export const circuitController = {
  async register(req: AuthRequest, res: Response): Promise<void> {
    try {
      const body = RegisterCircuitSchema.safeParse(req.body);
      if (!body.success) throw new ValidationError(body.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
      const header = req.header('Idempotency-Key');
      const key = header === undefined ? undefined : IdempotencyKeySchema.safeParse(header);
      if (key && !key.success) throw new ValidationError('Idempotency-Key must be 8-128 letters, digits, ".", "_" or "-"');
      const result = await circuitService.register(req.user!, body.data, key?.data);
      res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      handleError(error, res);
    }
  },
  async resendSecretaryInvite(req: AuthRequest, res: Response): Promise<void> {
    try {
      res.json(await circuitService.resendSecretaryInvitation(req.user!, req.params.circuitId));
    } catch (error) {
      handleError(error, res);
    }
  },
  async onboarding(req: AuthRequest, res: Response): Promise<void> {
    try { res.json(await onboardingService.status(req.user!, req.params.circuitId)); } catch (error) { handleError(error, res); }
  },
  async confirmStep(req: AuthRequest, res: Response): Promise<void> {
    try { res.json(await onboardingService.confirm(req.user!, req.params.circuitId, req.params.step.toUpperCase())); } catch (error) { handleError(error, res); }
  },
  async completeOnboarding(req: AuthRequest, res: Response): Promise<void> {
    try { res.json(await onboardingService.complete(req.user!, req.params.circuitId)); } catch (error) { handleError(error, res); }
  },
  async list(req: AuthRequest, res: Response): Promise<void> {
    try {
      const q = ListQuery.safeParse(req.query);
      if (!q.success) throw new ValidationError('Invalid query');
      res.json(await circuitService.list(req.user!, q.data));
    } catch (error) {
      handleError(error, res);
    }
  },
  async changeStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      const body = CircuitStatusSchema.safeParse(req.body);
      if (!body.success) throw new ValidationError('status must be ACTIVE, SUSPENDED or CLOSED');
      res.json(await circuitService.changeStatus(req.user!, req.params.circuitId, body.data.status));
    } catch (error) {
      handleError(error, res);
    }
  },
};

export const hierarchyController = new HierarchyController();
