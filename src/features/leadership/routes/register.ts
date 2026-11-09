import express, { Response, Router } from 'express';
import { z } from 'zod';
import { authenticate } from '@/middleware/auth';
import { AuthRequest } from '@/types';
import { ForbiddenError, ValidationError } from '@/types/errors';
import { handleError } from '@/utils/errorHandler';
import { catalogueService } from '../service/catalogue';
import { appointmentService } from '../service/appointments';
import { leadershipImportService as imports } from '../service/leadershipImport';

const router = Router();
router.use(authenticate, (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

type H = (req: AuthRequest, res: Response) => Promise<void>;
const g = (fn: H) => async (req: AuthRequest, res: Response) => { try { await fn(req, res); } catch (e) { handleError(e, res); } };
const parse = <T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, v: unknown): T => {
  const r = schema.safeParse(v);
  if (!r.success) throw new ValidationError(r.error.issues.map((i) => `${i.path.join('.') || 'request'}: ${i.message}`).join('; '));
  return r.data;
};
const csvBody = (req: AuthRequest) => { if (typeof req.body !== 'string' || !req.body.trim()) throw new ValidationError('Send the CSV as the request body with Content-Type: text/csv'); return req.body; };
const csv = express.text({ type: ['text/csv', 'text/plain'], limit: '5mb' });
const sendCsv = (res: Response, filename: string, text: string) => { res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${filename}"`); res.send(text); };

// Positions
router.get('/positions', g(async (req, res) => { res.json({ positions: await catalogueService.list(req.user!) }); }));
router.put('/positions/:code/mapping', g(async (req, res) => {
  const { roleId } = parse(z.object({ roleId: z.string().min(1).nullable() }), req.body);
  res.json(await catalogueService.setMapping(req.user!, req.params.code, roleId));
}));

// Appointments
const ListQ = z.object({ asOf: z.coerce.date().optional(), status: z.enum(['PENDING', 'ACTIVE', 'REVOKED', 'ENDED']).optional(), position: z.string().optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(50) });
router.get('/appointments', g(async (req, res) => { const q = parse(ListQ, req.query); res.json(await appointmentService.list(req.user!, { asOf: q.asOf, status: q.status, positionCode: q.position, page: q.page, pageSize: q.pageSize })); }));
router.post('/appointments/:id/approve', g(async (req, res) => { res.json(await appointmentService.approve(req.user!, req.params.id)); }));
router.post('/appointments/:id/revoke', g(async (req, res) => { res.json(await appointmentService.revoke(req.user!, req.params.id, typeof req.body?.reason === 'string' ? req.body.reason : undefined)); }));

// Leadership CSV import
router.get('/import/template', g(async (req, res) => {
  if (!req.user!.permissions.includes('leadership:import')) throw new ForbiddenError('Forbidden: leadership:import permission required');
  const t = imports.template(); res.setHeader('X-Template-Version', t.version); sendCsv(res, t.filename, t.csv);
}));
router.post('/import', csv, g(async (req, res) => {
  const { fileName } = parse(z.object({ fileName: z.string().trim().min(1).max(200).default('leadership.csv') }), req.query);
  const out = await imports.stage(req.user!, csvBody(req), fileName); res.status(out.reused ? 200 : 201).json(out);
}));
router.get('/import/:jobId', g(async (req, res) => { res.json(await imports.get(req.user!, req.params.jobId)); }));
router.get('/import/:jobId/rows', g(async (req, res) => {
  const q = parse(z.object({ status: z.enum(['VALID', 'REJECTED', 'REVIEW', 'IMPORTED', 'SKIPPED', 'FAILED']).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(50) }), req.query);
  res.json(await imports.rows(req.user!, req.params.jobId, q));
}));
router.get('/import/:jobId/problems.csv', g(async (req, res) => { const r = await imports.errorReport(req.user!, req.params.jobId); sendCsv(res, r.filename, r.csv); }));
router.put('/import/:jobId/decisions', g(async (req, res) => {
  const b = parse(z.object({ decisions: z.array(z.object({ row: z.number().int().min(2), decision: z.string().min(4).max(60) })).min(1).max(5000) }), req.body);
  res.json(await imports.decide(req.user!, req.params.jobId, b.decisions));
}));
router.post('/import/:jobId/confirm', g(async (req, res) => { res.json(await imports.confirm(req.user!, req.params.jobId, parse(z.object({ skipUnresolved: z.boolean().default(false) }).default({}), req.body ?? {}))); }));
router.post('/import/:jobId/cancel', g(async (req, res) => { res.json(await imports.cancel(req.user!, req.params.jobId)); }));

export default router;
