import { guarded } from '@/features/shared';
import { campaignService as service } from '../service';
import * as T from '../types';

export class CampaignController {
  create = guarded(async (req, res) => { res.status(201).json(await service.create(req.user!, T.CreateCampaignSchema.parse(req.body))); });
  list = guarded(async (req, res) => { res.json(await service.list(req.user!, T.CampaignListQuerySchema.parse(req.query))); });
  get = guarded(async (req, res) => { res.json(await service.get(req.user!, req.params.id)); });
  update = guarded(async (req, res) => { res.json(await service.update(req.user!, req.params.id, T.UpdateCampaignSchema.parse(req.body))); });
  activate = guarded(async (req, res) => { res.json(await service.activate(req.user!, req.params.id)); });
  close = guarded(async (req, res) => { res.json(await service.close(req.user!, req.params.id)); });
  publicView = guarded(async (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json(await service.publicView(req.params.slug));
  });
}

export const campaignController = new CampaignController();
