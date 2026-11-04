import { NextFunction, Request, Response, Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/authorization';
import { adminController as c } from '../controller';

const router = Router();
router.use(authenticate, (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

const roles = authorize('admin:role:manage');
router.get('/permissions', roles, c.permissions);
router.get('/roles', roles, c.listRoles);
router.post('/roles', roles, c.createRole);
router.get('/roles/:id', roles, c.getRole);
router.put('/roles/:id', roles, c.updateRole);
router.put('/roles/:id/permissions', roles, c.setRolePermissions);
router.delete('/roles/:id', roles, c.deleteRole);

const users = authorize('admin:user:manage');
router.get('/users', users, c.listUsers);
router.get('/users/:id', users, c.getUser);
router.post('/users/:id/disable', users, c.disableUser);
router.post('/users/:id/enable', users, c.enableUser);
router.post('/users/:id/revoke-sessions', users, c.revokeSessions);
router.post('/users/:id/roles', users, c.assignRole);
router.delete('/users/:id/roles/:assignmentId', users, c.removeRole);

const settings = authorize('admin:settings:manage');
router.get('/settings', settings, c.listSettings);
router.put('/settings/:key', settings, c.setSetting);
router.delete('/settings/:key', settings, c.resetSetting);

const auditView = authorize('admin:audit:view');
router.get('/audit-logs', auditView, c.listAudit);
router.get('/audit-logs/export', auditView, c.exportAudit);

const retention = authorize('admin:retention:manage');
router.get('/retention', retention, c.listRetention);
router.put('/retention', retention, c.setRetention);
router.delete('/retention/:entityType', retention, c.removeRetention);
router.post('/retention/run', retention, c.runRetention);

router.get('/api-reference', authorize('admin:api:view'), c.apiReference);

export default router;
