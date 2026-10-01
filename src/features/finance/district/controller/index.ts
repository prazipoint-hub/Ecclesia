import { Response } from 'express';
import { districtFinanceService } from '../service';
import { AuthRequest } from '@/types';
import { handleError } from '@/utils/errorHandler';

export class DistrictFinanceController {
  async getDashboard(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { circuitId } = req.params;
      const dashboard = await districtFinanceService.getCircuitFinanceDashboard(circuitId, req.user!);
      res.json(dashboard);
    } catch (error) {
      handleError(error, res);
    }
  }

  async listPendingExpenditures(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { circuitId } = req.params;
      const { skip = '0', take = '20' } = req.query;

      const data = await districtFinanceService.listPendingExpenditures(circuitId, req.user!, {
        skip: parseInt(skip as string, 10),
        take: parseInt(take as string, 10),
      });

      res.json(data);
    } catch (error) {
      handleError(error, res);
    }
  }
}

export const districtFinanceController = new DistrictFinanceController();
