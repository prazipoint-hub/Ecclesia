import { guarded } from '@/features/shared';
import { assetService as service } from '../service';
import * as T from '../types';

export class AssetController {
  categories = guarded(async (req, res) => { res.json(await service.categories(req.user!)); });
  createCategory = guarded(async (req, res) => { res.status(201).json(await service.createCategory(req.user!, T.CreateCategorySchema.parse(req.body).name)); });
  list = guarded(async (req, res) => { res.json(await service.list(req.user!, T.AssetListQuerySchema.parse(req.query))); });
  get = guarded(async (req, res) => { res.json(await service.get(req.user!, req.params.id)); });
  create = guarded(async (req, res) => { res.status(201).json(await service.create(req.user!, T.CreateAssetSchema.parse(req.body))); });
  update = guarded(async (req, res) => { res.json(await service.update(req.user!, req.params.id, T.UpdateAssetSchema.parse(req.body))); });
  retire = guarded(async (req, res) => { res.json(await service.retire(req.user!, req.params.id)); });
  recordMaintenance = guarded(async (req, res) => { res.status(201).json(await service.recordMaintenance(req.user!, req.params.id, T.RecordMaintenanceSchema.parse(req.body))); });
  due = guarded(async (req, res) => { res.json(await service.due(req.user!, T.DueQuerySchema.parse(req.query).days)); });
}

export const assetController = new AssetController();
