import { Response } from 'express';
import { districtFinanceService } from '../service';
import { CreateDistrictReceiptSchema, CreateDistrictExpenditureSchema } from '../types';
import { AuthRequest } from '@/types';
import { handleError } from '@/utils/errorHandler';

export class DistrictFinanceController {
  async getDashboard(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { circuitId } = req.params;
      const dashboard = await districtFinanceService.getDistrictFinanceDashboard(circuitId, req.user!);
      res.json(dashboard);
    } catch (error) {
      handleError(error, res);
    }
  }

  async createReceipt(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { circuitId } = req.params;
      const validated = CreateDistrictReceiptSchema.parse({
        ...req.body,
        circuitId,
      });

      const receipt = await districtFinanceService.createDistrictReceipt(validated, req.user!);
      res.status(201).json(receipt);
    } catch (error) {
      handleError(error, res);
    }
  }

  async createExpenditure(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { circuitId } = req.params;
      const validated = CreateDistrictExpenditureSchema.parse({
        ...req.body,
        circuitId,
      });

      const expenditure = await districtFinanceService.createDistrictExpenditure(validated, req.user!);
      res.status(201).json(expenditure);
    } catch (error) {
      handleError(error, res);
    }
  }

  async listPendingExpenditures(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { circuitId } = req.params;
      const { skip = '0', take = '20' } = req.query;

      const pending = await districtFinanceService.listPendingExpenditures(
        circuitId,
        req.user!,
        {
          skip: parseInt(skip as string, 10),
          take: parseInt(take as string, 10),
        }
      );

      res.json(pending);
    } catch (error) {
      handleError(error, res);
    }
  }

  async approveExpenditure(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { circuitId, expenditureId } = req.params;
      const { approved, approverNotes } = req.body;

      if (approved === undefined) {
        res.status(400).json({ error: 'approved field required' });
        return;
      }

      const result = await districtFinanceService.approveDistrictExpenditure(
        expenditureId,
        approved,
        approverNotes,
        req.user!,
        circuitId
      );

      res.json(result);
    } catch (error) {
      handleError(error, res);
    }
  }

  async paymentExpenditure(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { circuitId, expenditureId } = req.params;
      const { paymentMethod } = req.body;

      if (!paymentMethod) {
        res.status(400).json({ error: 'paymentMethod required' });
        return;
      }

      const result = await districtFinanceService.paymentDistrictExpenditure(
        expenditureId,
        paymentMethod,
        req.user!,
        circuitId
      );

      res.json(result);
    } catch (error) {
      handleError(error, res);
    }
  }
}

export const districtFinanceController = new DistrictFinanceController();
