import { Response } from 'express';
import { mainChurchFinanceService } from '../service';
import { CreateChurchReceiptSchema, CreateChurchExpenditureSchema } from '../types';
import { AuthRequest } from '@/types';
import { handleError } from '@/utils/errorHandler';

export class MainChurchFinanceController {
  async getDashboard(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { churchId } = req.params;
      const dashboard = await mainChurchFinanceService.getChurchFinanceDashboard(churchId, req.user!);
      res.json(dashboard);
    } catch (error) {
      handleError(error, res);
    }
  }

  async createReceipt(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { churchId } = req.params;
      const validated = CreateChurchReceiptSchema.parse({
        ...req.body,
        churchId,
      });

      const receipt = await mainChurchFinanceService.createChurchReceipt(validated, req.user!);
      res.status(201).json(receipt);
    } catch (error) {
      handleError(error, res);
    }
  }

  async createExpenditure(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { churchId } = req.params;
      const validated = CreateChurchExpenditureSchema.parse({
        ...req.body,
        churchId,
      });

      const expenditure = await mainChurchFinanceService.createChurchExpenditure(validated, req.user!);
      res.status(201).json(expenditure);
    } catch (error) {
      handleError(error, res);
    }
  }

  async listPendingExpenditures(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { churchId } = req.params;
      const { skip = '0', take = '20' } = req.query;

      const pending = await mainChurchFinanceService.listPendingExpenditures(
        churchId,
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
      const { churchId, expenditureId } = req.params;
      const { approved, approverNotes } = req.body;

      if (approved === undefined) {
        res.status(400).json({ error: 'approved field required' });
        return;
      }

      const result = await mainChurchFinanceService.approveChurchExpenditure(
        expenditureId,
        approved,
        approverNotes,
        req.user!,
        churchId
      );

      res.json(result);
    } catch (error) {
      handleError(error, res);
    }
  }

  async paymentExpenditure(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { churchId, expenditureId } = req.params;
      const { paymentMethod } = req.body;

      if (!paymentMethod) {
        res.status(400).json({ error: 'paymentMethod required' });
        return;
      }

      const result = await mainChurchFinanceService.paymentChurchExpenditure(
        expenditureId,
        paymentMethod,
        req.user!,
        churchId
      );

      res.json(result);
    } catch (error) {
      handleError(error, res);
    }
  }
}

export const mainChurchFinanceController = new MainChurchFinanceController();
