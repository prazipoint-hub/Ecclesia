import { Response } from 'express';
import { AuthRequest } from '@/types';
import { handleError } from '@/utils/errorHandler';
import { dashboardService } from '../service/dashboards';
import { savedReportService } from '../service/saved';
import * as T from '../types/saved';

type Handler = (req: AuthRequest, res: Response) => Promise<void>;
const guarded = (handler: Handler): Handler => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    handleError(error, res);
  }
};

/** Binary formats download; JSON comes back inline so the page can show it. */
const sendFile = (res: Response, { file, executionId }: Awaited<ReturnType<typeof savedReportService.runAdhoc>>) => {
  res.setHeader('X-Execution-Id', executionId);
  res.setHeader('Access-Control-Expose-Headers', 'X-Execution-Id, Content-Disposition');
  if (file.format === 'JSON') {
    res.json({ executionId, filename: file.filename, data: JSON.parse(String(file.content)) });
    return;
  }
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.send(file.content);
};

export class SavedReportController {
  catalog = guarded(async (req, res) => { res.json(savedReportService.catalog(req.user!)); });
  run = guarded(async (req, res) => { sendFile(res, await savedReportService.runAdhoc(req.user!, T.RunReportSchema.parse(req.body))); });

  listSaved = guarded(async (req, res) => { res.json(await savedReportService.list(req.user!, Boolean(T.SavedListQuerySchema.parse(req.query).mine))); });
  getSaved = guarded(async (req, res) => { res.json(await savedReportService.get(req.user!, req.params.id)); });
  createSaved = guarded(async (req, res) => { res.status(201).json(await savedReportService.create(req.user!, T.CreateSavedReportSchema.parse(req.body))); });
  updateSaved = guarded(async (req, res) => { res.json(await savedReportService.update(req.user!, req.params.id, T.UpdateSavedReportSchema.parse(req.body))); });
  deleteSaved = guarded(async (req, res) => { res.json(await savedReportService.remove(req.user!, req.params.id)); });
  runSaved = guarded(async (req, res) => { sendFile(res, await savedReportService.runSaved(req.user!, req.params.id)); });
  runDue = guarded(async (_req, res) => { res.json(await savedReportService.runDue()); });
  executions = guarded(async (req, res) => { res.json(await savedReportService.executions(req.user!, T.ExecutionListQuerySchema.parse(req.query))); });

  churchDashboard = guarded(async (req, res) => { res.json(await dashboardService.church(req.user!)); });
  sectionDashboard = guarded(async (req, res) => { res.json(await dashboardService.section(req.user!, T.SectionDashboardParamsSchema.parse(req.params).sectionId)); });
  hierarchyDashboard = guarded(async (req, res) => { res.json(await dashboardService.hierarchy(req.user!, T.HierarchyLevelSchema.parse(req.params.level.toUpperCase()))); });
}

export const savedReportController = new SavedReportController();
