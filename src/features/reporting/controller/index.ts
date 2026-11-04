import { Response } from 'express';
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
      const validated = GenerateFinancialReportSchema.parse(req.body);

      const report = await reportingService.generateFinancialReport(
        {
          ...validated, startDate: new Date(validated.startDate), endDate: new Date(validated.endDate),
        },
        req.user!
      );

      this.sendReport(res, report);
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
      const validated = GenerateAdministrativeReportSchema.parse(req.body);

      const report = await reportingService.generateAdministrativeReport(
        {
          ...validated,
          startDate: validated.startDate ? new Date(validated.startDate) : undefined,
          endDate: validated.endDate ? new Date(validated.endDate) : undefined,
        },
        req.user!
      );

      this.sendReport(res, report);
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
      const validated = GenerateAuditReportSchema.parse(req.body);

      const report = await reportingService.generateAuditReport(
        {
          ...validated, startDate: new Date(validated.startDate), endDate: new Date(validated.endDate),
        },
        req.user!
      );

      this.sendReport(res, report);
    } catch (error) {
      handleError(error, res);
    }
  }

  private sendReport(res: Response, report: { format: string; filename: string; mimeType: string; content: string | Buffer; [key: string]: unknown }): void {
    if (report.format === 'JSON') {
      res.json(report);
      return;
    }
    res.setHeader('Content-Type', report.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
    res.send(report.content);
  }
}

export const reportingController = new ReportingController();
