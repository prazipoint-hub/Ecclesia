import { Response } from 'express';
import { sectionFinanceService } from '../service';
import { CreateSectionReceiptSchema, CreateSectionExpenditureSchema } from '../types';
import { AuthRequest } from '@/types';
import { handleError } from '@/utils/errorHandler';

export class SectionFinanceController {
  /**
   * GET /api/v2/sections/:sectionId/finance/dashboard
   */
  async getDashboard(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { sectionId } = req.params;
      const dashboard = await sectionFinanceService.getSectionFinanceDashboard(sectionId, req.user!);

      res.json(dashboard);
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * POST /api/v2/sections/:sectionId/finance/receipts
   * Create section receipt
   */
  async createReceipt(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { sectionId } = req.params;
      const validated = CreateSectionReceiptSchema.parse({
        ...req.body,
        sectionId,
      });

      const receipt = await sectionFinanceService.createSectionReceipt(validated, req.user!);

      res.status(201).json(receipt);
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * POST /api/v2/sections/:sectionId/finance/expenditures
   * Create section expenditure request
   */
  async createExpenditure(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { sectionId } = req.params;
      const validated = CreateSectionExpenditureSchema.parse({
        ...req.body,
        sectionId,
      });

      const expenditure = await sectionFinanceService.createSectionExpenditure(validated, req.user!);

      res.status(201).json(expenditure);
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * GET /api/v2/sections/:sectionId/finance/expenditures/pending
   * List pending expenditures for approval
   */
  async listPendingExpenditures(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { sectionId } = req.params;
      const { skip = '0', take = '20' } = req.query;

      const pending = await sectionFinanceService.listPendingExpenditures(
        sectionId,
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

  /**
   * POST /api/v2/sections/:sectionId/finance/expenditures/:expenditureId/approve
   * Approve or reject section expenditure
   */
  async approveExpenditure(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { sectionId, expenditureId } = req.params;
      const { approved, approverNotes } = req.body;

      if (approved === undefined) {
        res.status(400).json({ error: 'approved field required' });
        return;
      }

      const result = await sectionFinanceService.approveSectionExpenditure(
        expenditureId,
        approved,
        approverNotes,
        req.user!,
        sectionId
      );

      res.json(result);
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * POST /api/v2/sections/:sectionId/finance/expenditures/:expenditureId/pay
   * Record payment for approved expenditure
   */
  async paymentExpenditure(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { sectionId, expenditureId } = req.params;
      const { paymentMethod } = req.body;

      if (!paymentMethod) {
        res.status(400).json({ error: 'paymentMethod required' });
        return;
      }

      const result = await sectionFinanceService.paymentSectionExpenditure(
        expenditureId,
        paymentMethod,
        req.user!,
        sectionId
      );

      res.json(result);
    } catch (error) {
      handleError(error, res);
    }
  }
}

export const sectionFinanceController = new SectionFinanceController();
