import { Router, Response } from 'express';
import { authenticate } from '@/middleware/auth';
import { AuthRequest } from '@/types';
import { handleError } from '@/utils/errorHandler';
import { profileCompletionService as s } from '../service/profileCompletion';

const guarded = (fn: (req: AuthRequest, res: Response) => Promise<void>) => async (req: AuthRequest, res: Response) => {
  try { await fn(req, res); } catch (error) { handleError(error, res); }
};

/** Mounted at /api/v2/me/profile-completion (the caller's own record) and /api/v2/profile-admin (staff). */
export const mine = Router();
mine.use(authenticate);
mine.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
mine.get('/', guarded(async (req, res) => { res.json(await s.mine(req.user!)); }));
mine.put('/next-of-kin', guarded(async (req, res) => { res.json(await s.setNextOfKin(req.user!, req.body)); }));
mine.get('/changes', guarded(async (req, res) => { res.json({ requests: await s.myRequests(req.user!) }); }));
mine.post('/changes', guarded(async (req, res) => { res.status(201).json(await s.requestChange(req.user!, req.body)); }));

export const admin = Router();
admin.use(authenticate);
admin.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
admin.get('/rule', guarded(async (req, res) => { res.json(await s.rule(req.user!.churchId)); }));
admin.put('/rule', guarded(async (req, res) => { res.json(await s.setRule(req.user!, req.body)); }));
admin.get('/report', guarded(async (req, res) => { res.json(await s.report(req.user!)); }));
admin.get('/changes', guarded(async (req, res) => { res.json({ requests: await s.queue(req.user!) }); }));
admin.post('/changes/:id/approve', guarded(async (req, res) => { res.json(await s.approve(req.user!, req.params.id, req.body)); }));
admin.post('/changes/:id/reject', guarded(async (req, res) => { res.json(await s.reject(req.user!, req.params.id, req.body)); }));
