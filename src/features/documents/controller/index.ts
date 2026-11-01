import { guarded } from '@/features/shared';
import { documentService as service } from '../service';
import * as T from '../types';

export class DocumentController {
  templates = guarded(async (req, res) => { res.json(await service.templates(req.user!, typeof req.query.type === 'string' ? req.query.type : undefined)); });
  createTemplate = guarded(async (req, res) => { res.status(201).json(await service.createTemplate(req.user!, T.CreateTemplateSchema.parse(req.body))); });
  updateTemplate = guarded(async (req, res) => { res.json(await service.updateTemplate(req.user!, req.params.id, T.UpdateTemplateSchema.parse(req.body))); });
  generate = guarded(async (req, res) => { res.status(201).json(await service.generate(req.user!, T.GenerateDocumentSchema.parse(req.body))); });
  list = guarded(async (req, res) => { res.json(await service.list(req.user!, T.DocumentListQuerySchema.parse(req.query))); });
  get = guarded(async (req, res) => { res.json(await service.get(req.user!, req.params.id)); });
  void = guarded(async (req, res) => { res.json(await service.void(req.user!, req.params.id, T.VoidDocumentSchema.parse(req.body).reason)); });
  pdf = guarded(async (req, res) => {
    const { buffer, filename } = await service.pdf(req.user!, req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  });
}

export const documentController = new DocumentController();
