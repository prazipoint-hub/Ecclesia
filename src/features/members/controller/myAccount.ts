import { Response } from 'express';
import { AuthRequest } from '@/types';
import { handleError } from '@/utils/errorHandler';
import { myAccountService } from '../service/myAccount';
import {
  GivingListQuerySchema,
  GivingYearQuerySchema,
  NotificationListQuerySchema,
  UpdateOwnProfileSchema,
} from '../types/myAccount';

export class MyAccountController {
  async getProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      res.json(await myAccountService.getProfile(req.user!));
    } catch (error) {
      handleError(error, res);
    }
  }

  async updateProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      const input = UpdateOwnProfileSchema.parse(req.body);
      res.json(await myAccountService.updateProfile(req.user!, input));
    } catch (error) {
      handleError(error, res);
    }
  }

  async getFamily(req: AuthRequest, res: Response): Promise<void> {
    try {
      res.json(await myAccountService.getFamily(req.user!));
    } catch (error) {
      handleError(error, res);
    }
  }

  async listGiving(req: AuthRequest, res: Response): Promise<void> {
    try {
      res.json(await myAccountService.listGiving(req.user!, GivingListQuerySchema.parse(req.query)));
    } catch (error) {
      handleError(error, res);
    }
  }

  async getGivingSummary(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { year } = GivingYearQuerySchema.parse(req.query);
      res.json(await myAccountService.getGivingSummary(req.user!, year));
    } catch (error) {
      handleError(error, res);
    }
  }

  async downloadStatement(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { year } = GivingYearQuerySchema.parse(req.query);
      const { filename, pdf } = await myAccountService.buildStatement(req.user!, year);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdf);
    } catch (error) {
      handleError(error, res);
    }
  }

  async listNotifications(req: AuthRequest, res: Response): Promise<void> {
    try {
      res.json(await myAccountService.listNotifications(req.user!, NotificationListQuerySchema.parse(req.query)));
    } catch (error) {
      handleError(error, res);
    }
  }

  async markNotificationRead(req: AuthRequest, res: Response): Promise<void> {
    try {
      await myAccountService.markNotificationRead(req.user!, req.params.notificationId);
      res.status(204).send();
    } catch (error) {
      handleError(error, res);
    }
  }

  async markAllNotificationsRead(req: AuthRequest, res: Response): Promise<void> {
    try {
      await myAccountService.markAllNotificationsRead(req.user!);
      res.status(204).send();
    } catch (error) {
      handleError(error, res);
    }
  }
}

export const myAccountController = new MyAccountController();
