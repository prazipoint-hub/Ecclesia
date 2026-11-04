import { Response } from 'express';
import { AuthRequest } from '@/types';
import { ValidationError } from '@/types/errors';
import { handleError } from '@/utils/errorHandler';
import { directoryService } from '../service/directory';
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

export const directoryController = new DirectoryController();
