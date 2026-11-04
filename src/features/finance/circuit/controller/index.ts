import { Response } from 'express';
import { circuitFinanceService } from '../service';
import { CreateCircuitReceiptSchema, CreateCircuitExpenditureSchema, PendingListQuerySchema } from '../types';
import { AuthRequest } from '@/types';
import { handleError } from '@/utils/errorHandler';

export class CircuitFinanceController {
  async getDashboard(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { circuitId } = req.params;
      const dashboard = await circuitFinanceService.getCircuitFinanceDashboard(circuitId, req.user!);
      res.json(dashboard);
    } catch (error) {
      handleError(error, res);
    }
  }

  async createReceipt(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { circuitId } = req.params;
      const validated = CreateCircuitReceiptSchema.parse({
        ...req.body,
        circuitId,
      });

      const receipt = await circuitFinanceService.createCircuitReceipt(validated, req.user!);
      res.status(201).json(receipt);
    } catch (error) {
      handleError(error, res);
    }
  }

  async createExpenditure(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { circuitId } = req.params;
      const validated = CreateCircuitExpenditureSchema.parse({
        ...req.body,
        circuitId,
      });

      const expenditure = await circuitFinanceService.createCircuitExpenditure(validated, req.user!);
      res.status(201).json(expenditure);
    } catch (error) {
      handleError(error, res);
    }
  }

  async listPendingExpenditures(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { circuitId } = req.params;
      const page = PendingListQuerySchema.parse(req.query);

      const pending = await circuitFinanceService.listPendingExpenditures(
        circuitId,
        req.user!,
        page
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

      if (typeof approved !== 'boolean') {
        res.status(400).json({ error: 'approved field required (true or false)' });
        return;
      }

      const result = await circuitFinanceService.approveCircuitExpenditure(
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

      const result = await circuitFinanceService.paymentCircuitExpenditure(
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

export const circuitFinanceController = new CircuitFinanceController();
