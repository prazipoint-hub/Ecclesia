import { Request, Response } from 'express';
import { reportingService } from '../service';
import { GenerateFinancialReportSchema, GenerateAdministrativeReportSchema, GenerateAuditReportSchema } from '../types';
import { AuthRequest } from '@/types';
import { handleError } from '@/utils/errorHandler';

export class ReportingController {
  /**
   * POST /api/v2/reports/financial
   * Generate financial report
   */
  async generateFinancialReport(req: AuthRequest, res: Response): Promise<void> {
    try {
      const validated = GenerateFinancialReportSchema.parse({
        ...req.body,
        startDate: new Date(req.body.startDate),
        endDate: new Date(req.body.endDate),
      });

      const report = await reportingService.generateFinancialReport(
        {
          ...validated,
        },
        req.user!
      );

      res.json(report);
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * POST /api/v2/reports/administrative
   * Generate administrative report
   */
  async generateAdministrativeReport(req: AuthRequest, res: Response): Promise<void> {
    try {
      const validated = GenerateAdministrativeReportSchema.parse({
        ...req.body,
        startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
      });

      const report = await reportingService.generateAdministrativeReport(
        {
          ...validated,
        },
        req.user!
      );

      res.json(report);
    } catch (error) {
      handleError(error, res);
    }
  }

  /**
   * POST /api/v2/reports/audit
   * Generate audit report
   */
  async generateAuditReport(req: AuthRequest, res: Response): Promise<void> {
    try {
      const validated = GenerateAuditReportSchema.parse({
        ...req.body,
        startDate: new Date(req.body.startDate),
        endDate: new Date(req.body.endDate),
      });

      const report = await reportingService.generateAuditReport(
        {
          ...validated,
        },
        req.user!
      );

      res.json(report);
    } catch (error) {
      handleError(error, res);
    }
  }
}

export const reportingController = new ReportingController();
