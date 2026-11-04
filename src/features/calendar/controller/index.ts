import { guarded } from '@/features/shared';
import { calendarService as service } from '../service';
import { CreateFeedSchema } from '../types';

export class CalendarController {
  createFeed = guarded(async (req, res) => { res.status(201).json(await service.createFeed(req.user!, CreateFeedSchema.parse(req.body ?? {}).label)); });
  listFeeds = guarded(async (req, res) => { res.json(await service.listFeeds(req.user!)); });
  revokeFeed = guarded(async (req, res) => { res.json(await service.revokeFeed(req.user!, req.params.id)); });
  ics = guarded(async (req, res) => {
    const body = await service.render(req.params.token.replace(/\.ics$/, ''));
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.send(body);
  });
}

export const calendarController = new CalendarController();
