import express, { Router, Response } from 'express';
import { authenticate } from '@/middleware/auth';
import { AuthRequest } from '@/types';
import { handleError } from '@/utils/errorHandler';
import { profileCompletionService as s } from '../service/profileCompletion';
import { profileExtrasService as x } from '../service/profileExtras';

const image = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream'], limit: '400kb' });
const sendPhoto = (res: Response, p: { mimeType: string; data: Buffer; sha256: string }) => {
  res.setHeader('Content-Type', p.mimeType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
  res.setHeader('ETag', `"${p.sha256}"`);
  res.send(p.data);
};

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

mine.get('/fields', guarded(async (req, res) => { res.json(await x.mine(req.user!)); }));
mine.put('/fields', guarded(async (req, res) => { res.json(await x.setMine(req.user!, req.body)); }));
mine.get('/photo', guarded(async (req, res) => { sendPhoto(res, await x.getPhoto(req.user!, req.user!.memberId ?? '')); }));
mine.put('/photo', image, guarded(async (req, res) => { res.json(await x.putPhoto(req.user!, req.user!.memberId ?? '', req.body)); }));
mine.delete('/photo', guarded(async (req, res) => { res.json(await x.deletePhoto(req.user!, req.user!.memberId ?? '')); }));
mine.get('/dependants', guarded(async (req, res) => { res.json(await x.myDependants(req.user!)); }));
mine.get('/dependants/:id/fields', guarded(async (req, res) => { res.json(await x.dependantFields(req.user!, req.params.id)); }));
mine.put('/dependants/:id/fields', guarded(async (req, res) => { res.json(await x.setDependantFields(req.user!, req.params.id, req.body)); }));
mine.put('/dependants/:id/next-of-kin', guarded(async (req, res) => { res.json(await x.setDependantNextOfKin(req.user!, req.params.id, req.body)); }));
mine.post('/dependants/:id/changes', guarded(async (req, res) => { res.status(201).json(await x.requestDependantChange(req.user!, req.params.id, req.body)); }));
mine.get('/dependants/:id/photo', guarded(async (req, res) => { sendPhoto(res, await x.getPhoto(req.user!, req.params.id)); }));
mine.put('/dependants/:id/photo', image, guarded(async (req, res) => { res.json(await x.putPhoto(req.user!, req.params.id, req.body)); }));

export const admin = Router();
admin.use(authenticate);
admin.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
admin.get('/rule', guarded(async (req, res) => { res.json(await s.rule(req.user!.churchId)); }));
admin.put('/rule', guarded(async (req, res) => { res.json(await s.setRule(req.user!, req.body)); }));
admin.get('/report', guarded(async (req, res) => { res.json(await s.report(req.user!)); }));
admin.get('/changes', guarded(async (req, res) => { res.json({ requests: await s.queue(req.user!) }); }));
admin.post('/changes/:id/approve', guarded(async (req, res) => { res.json(await s.approve(req.user!, req.params.id, req.body)); }));
admin.post('/changes/:id/reject', guarded(async (req, res) => { res.json(await s.reject(req.user!, req.params.id, req.body)); }));
admin.get('/fields', guarded(async (req, res) => { res.json({ fields: await x.fieldsAdmin(req.user!) }); }));
admin.post('/fields', guarded(async (req, res) => { res.status(201).json(await x.createField(req.user!, req.body)); }));
admin.put('/fields/:id', guarded(async (req, res) => { res.json(await x.updateField(req.user!, req.params.id, req.body)); }));
admin.get('/guardians', guarded(async (req, res) => { res.json({ guardians: await x.listGuardians(req.user!) }); }));
admin.post('/guardians', guarded(async (req, res) => { res.status(201).json(await x.linkGuardian(req.user!, req.body)); }));
admin.delete('/guardians/:id', guarded(async (req, res) => { res.json(await x.revokeGuardian(req.user!, req.params.id)); }));
admin.get('/members/:id/photo', guarded(async (req, res) => { sendPhoto(res, await x.getPhoto(req.user!, req.params.id)); }));
