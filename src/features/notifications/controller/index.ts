import { Response } from 'express';
import { AuthRequest } from '@/types';
import { handleError } from '@/utils/errorHandler';
import { notificationService } from '../service';
import {
  AudiencePreviewSchema,
  BroadcastSchema,
  ListQuerySchema,
  PushSubscriptionSchema,
  RemovePushSchema,
  ScheduleSchema,
  TemplateSchema,
  UpdateBroadcastSchema,
  UpdatePreferencesSchema,
  UpdateTemplateSchema,
} from '../types';

type Handler = (req: AuthRequest, res: Response) => Promise<void>;

const guarded = (handler: Handler): Handler => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    handleError(error, res);
  }
};

export class NotificationController {
  getPreferences = guarded(async (req, res) => {
    res.json(await notificationService.getPreferences(req.user!));
  });

  updatePreferences = guarded(async (req, res) => {
    res.json(await notificationService.updatePreferences(req.user!, UpdatePreferencesSchema.parse(req.body).preferences));
  });

  subscribePush = guarded(async (req, res) => {
    await notificationService.subscribePush(req.user!, PushSubscriptionSchema.parse(req.body), req.get('user-agent'));
    res.status(204).send();
  });

  unsubscribePush = guarded(async (req, res) => {
    await notificationService.unsubscribePush(req.user!, RemovePushSchema.parse(req.body).endpoint);
    res.status(204).send();
  });

  listTemplates = guarded(async (req, res) => {
    res.json(await notificationService.listTemplates(req.user!));
  });

  createTemplate = guarded(async (req, res) => {
    res.status(201).json(await notificationService.createTemplate(req.user!, TemplateSchema.parse(req.body)));
  });

  updateTemplate = guarded(async (req, res) => {
    res.json(await notificationService.updateTemplate(req.user!, req.params.templateId, UpdateTemplateSchema.parse(req.body)));
  });

  deleteTemplate = guarded(async (req, res) => {
    await notificationService.deleteTemplate(req.user!, req.params.templateId);
    res.status(204).send();
  });

  previewAudience = guarded(async (req, res) => {
    res.json(await notificationService.previewAudience(req.user!, AudiencePreviewSchema.parse(req.body).audience));
  });

  createBroadcast = guarded(async (req, res) => {
    res.status(201).json(await notificationService.createBroadcast(req.user!, BroadcastSchema.parse(req.body)));
  });

  updateBroadcast = guarded(async (req, res) => {
    res.json(await notificationService.updateBroadcast(req.user!, req.params.broadcastId, UpdateBroadcastSchema.parse(req.body)));
  });

  listBroadcasts = guarded(async (req, res) => {
    res.json(await notificationService.listBroadcasts(req.user!, ListQuerySchema.parse(req.query)));
  });

  getBroadcast = guarded(async (req, res) => {
    res.json(await notificationService.getBroadcast(req.user!, req.params.broadcastId));
  });

  sendBroadcast = guarded(async (req, res) => {
    res.status(202).json(await notificationService.sendBroadcast(req.user!, req.params.broadcastId));
  });

  scheduleBroadcast = guarded(async (req, res) => {
    res.json(await notificationService.scheduleBroadcast(req.user!, req.params.broadcastId, ScheduleSchema.parse(req.body).scheduledAt));
  });

  cancelBroadcast = guarded(async (req, res) => {
    res.json(await notificationService.cancelBroadcast(req.user!, req.params.broadcastId));
  });

  runDue = guarded(async (req, res) => {
    res.json(await notificationService.runDueForUser(req.user!));
  });
}

export const notificationController = new NotificationController();
