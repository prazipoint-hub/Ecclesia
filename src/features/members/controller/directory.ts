import { Response } from 'express';
import { AuthRequest } from '@/types';
import { ValidationError } from '@/types/errors';
import { handleError } from '@/utils/errorHandler';
import { z } from 'zod';
import { directoryService } from '../service/directory';
import { importJobService } from '../service/importJobs';
import { TEMPLATE_SPEC } from '../service/importTemplate';
import { DirectoryQuerySchema, ImportQuerySchema } from '../types/directory';

type Handler = (req: AuthRequest, res: Response) => Promise<void>;

const guarded = (handler: Handler): Handler => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    handleError(error, res);
  }
};

function csvBody(req: AuthRequest): string {
  if (typeof req.body !== 'string' || req.body.trim() === '') throw new ValidationError('Send the CSV as the request body with Content-Type: text/csv');
  return req.body;
}

export class DirectoryController {
  search = guarded(async (req, res) => {
    res.json(await directoryService.search(req.user!, DirectoryQuerySchema.parse(req.query)));
  });

  exportCsv = guarded(async (req, res) => {
    const { filename, csv } = await directoryService.exportCsv(req.user!, DirectoryQuerySchema.parse(req.query));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  });

  previewImport = guarded(async (req, res) => {
    res.json(await directoryService.previewImport(req.user!, csvBody(req)));
  });

  runImport = guarded(async (req, res) => {
    const { fileName, skipInvalid } = ImportQuerySchema.parse(req.query);
    res.status(201).json(await directoryService.runImport(req.user!, csvBody(req), fileName, skipInvalid));
  });

  listImports = guarded(async (req, res) => {
    res.json(await directoryService.listImports(req.user!));
  });

  archive = guarded(async (req, res) => {
    res.json(await directoryService.archive(req.user!, req.params.id));
  });

  restore = guarded(async (req, res) => {
    res.json(await directoryService.restore(req.user!, req.params.id));
  });
}

const RowsQuery = z.object({
  status: z.enum(['VALID', 'REJECTED', 'REVIEW', 'IMPORTED', 'SKIPPED', 'FAILED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
const DecisionsBody = z.object({ decisions: z.array(z.object({ row: z.number().int().min(2), decision: z.enum(['CREATE', 'SKIP']) })).min(1).max(5000) });
const ConfirmBody = z.object({ skipUnresolved: z.boolean().default(false) }).default({});
const parse = <T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown): T => {
  const r = schema.safeParse(value);
  if (!r.success) throw new ValidationError(r.error.issues.map((i) => `${i.path.join('.') || 'request'}: ${i.message}`).join('; '));
  return r.data;
};

export class ImportJobController {
  templateCsv = guarded(async (_req, res) => {
    const t = importJobService.template();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${t.filename}"`);
    res.setHeader('X-Template-Version', t.version);
    res.send(t.csv);
  });
  templateSpec = guarded(async (_req, res) => { res.json(TEMPLATE_SPEC); });
  stage = guarded(async (req, res) => {
    const { fileName } = ImportQuerySchema.parse(req.query);
    const out = await importJobService.stage(req.user!, csvBody(req), fileName);
    res.status(out.reused ? 200 : 201).json(out);
  });
  get = guarded(async (req, res) => { res.json(await importJobService.get(req.user!, req.params.jobId)); });
  rows = guarded(async (req, res) => { res.json(await importJobService.rows(req.user!, req.params.jobId, parse(RowsQuery, req.query))); });
  problems = guarded(async (req, res) => {
    const { filename, csv } = await importJobService.errorReport(req.user!, req.params.jobId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  });
  decide = guarded(async (req, res) => { res.json(await importJobService.decide(req.user!, req.params.jobId, parse(DecisionsBody, req.body).decisions)); });
  confirm = guarded(async (req, res) => { res.json(await importJobService.confirm(req.user!, req.params.jobId, parse(ConfirmBody, req.body ?? {}))); });
  cancel = guarded(async (req, res) => { res.json(await importJobService.cancel(req.user!, req.params.jobId)); });
}

export const importJobController = new ImportJobController();
export const directoryController = new DirectoryController();
