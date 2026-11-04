import { Response } from 'express';
import { AuthRequest } from '@/types';
import { handleError } from '@/utils/errorHandler';
import { CreateEventSchema, RecordAttendanceSchema, UpdateEventSchema } from '../types';
import { eventService } from '../service';

const date = (value: unknown): Date | undefined => typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? new Date(value) : undefined;

export class EventController {
  async list(req: AuthRequest, res: Response): Promise<void> { try {
    const take = typeof req.query.take === 'string' ? Math.min(Math.max(Number.parseInt(req.query.take, 10) || 50, 1), 100) : 50;
    res.json(await eventService.list({ status: typeof req.query.status === 'string' ? req.query.status : undefined, from: date(req.query.from), to: date(req.query.to), take }, req.user!));
  } catch (error) { handleError(error, res); } }
  async get(req: AuthRequest, res: Response): Promise<void> { try { res.json(await eventService.get(req.params.eventId, req.user!)); } catch (error) { handleError(error, res); } }
  async create(req: AuthRequest, res: Response): Promise<void> { try { res.status(201).json(await eventService.create(CreateEventSchema.parse(req.body), req.user!)); } catch (error) { handleError(error, res); } }
  async update(req: AuthRequest, res: Response): Promise<void> { try { res.json(await eventService.update(req.params.eventId, UpdateEventSchema.parse(req.body), req.user!)); } catch (error) { handleError(error, res); } }
  async listAttendance(req: AuthRequest, res: Response): Promise<void> { try { res.json(await eventService.listAttendance(req.params.eventId, req.user!)); } catch (error) { handleError(error, res); } }
  async recordAttendance(req: AuthRequest, res: Response): Promise<void> { try { res.status(201).json(await eventService.recordAttendance(req.params.eventId, RecordAttendanceSchema.parse(req.body), req.user!)); } catch (error) { handleError(error, res); } }
}

export const eventController = new EventController();
