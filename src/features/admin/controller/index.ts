import { Response } from 'express';
import { AuthRequest } from '@/types';
import { ForbiddenError } from '@/types/errors';
import { handleError } from '@/utils/errorHandler';
import { listEndpoints, type Mount } from '../service/apiReference';
import { auditLogService } from '../service/auditLog';
import { retentionService } from '../service/retention';
import { roleService } from '../service/roles';
import { systemSettingsService } from '../service/systemSettings';
import { userAdminService } from '../service/users';
import * as T from '../types';

type Handler = (req: AuthRequest, res: Response) => Promise<void>;
const guarded = (handler: Handler): Handler => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    handleError(error, res);
  }
};

export class AdminController {
  // roles
  permissions = guarded(async (req, res) => { res.json(await roleService.permissions(req.user!)); });
  listRoles = guarded(async (req, res) => { res.json(await roleService.list(req.user!)); });
  getRole = guarded(async (req, res) => { res.json(await roleService.get(req.user!, req.params.id)); });
  createRole = guarded(async (req, res) => { res.status(201).json(await roleService.create(req.user!, T.CreateRoleSchema.parse(req.body))); });
  updateRole = guarded(async (req, res) => { res.json(await roleService.update(req.user!, req.params.id, T.UpdateRoleSchema.parse(req.body))); });
  setRolePermissions = guarded(async (req, res) => { res.json(await roleService.setPermissions(req.user!, req.params.id, T.SetRolePermissionsSchema.parse(req.body).permissions)); });
  deleteRole = guarded(async (req, res) => { res.json(await roleService.remove(req.user!, req.params.id)); });

  // users
  listUsers = guarded(async (req, res) => { res.json(await userAdminService.list(req.user!, T.UserListQuerySchema.parse(req.query))); });
  getUser = guarded(async (req, res) => { res.json(await userAdminService.get(req.user!, req.params.id)); });
  disableUser = guarded(async (req, res) => { res.json(await userAdminService.disable(req.user!, req.params.id, T.DisableUserSchema.parse(req.body).reason)); });
  enableUser = guarded(async (req, res) => { res.json(await userAdminService.enable(req.user!, req.params.id)); });
  revokeSessions = guarded(async (req, res) => { res.json(await userAdminService.revokeSessions(req.user!, req.params.id)); });
  assignRole = guarded(async (req, res) => { res.status(201).json(await userAdminService.assignRole(req.user!, req.params.id, T.AssignRoleSchema.parse(req.body))); });
  removeRole = guarded(async (req, res) => { res.json(await userAdminService.removeRole(req.user!, req.params.id, req.params.assignmentId)); });

  // settings
  listSettings = guarded(async (req, res) => { res.json(await systemSettingsService.list(req.user!)); });
  setSetting = guarded(async (req, res) => { res.json(await systemSettingsService.set(req.user!, req.params.key, T.SetSettingSchema.parse(req.body).value)); });
  resetSetting = guarded(async (req, res) => { res.json(await systemSettingsService.reset(req.user!, req.params.key)); });

  // audit
  listAudit = guarded(async (req, res) => { res.json(await auditLogService.list(req.user!, T.AuditQuerySchema.parse(req.query))); });
  exportAudit = guarded(async (req, res) => {
    const { filename, csv, truncated } = await auditLogService.exportCsv(req.user!, T.AuditQuerySchema.parse(req.query));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Export-Truncated', String(truncated));
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Export-Truncated');
    res.send(csv);
  });

  // retention
  listRetention = guarded(async (req, res) => { res.json(await retentionService.list(req.user!)); });
  setRetention = guarded(async (req, res) => { res.json(await retentionService.set(req.user!, T.SetRetentionRuleSchema.parse(req.body))); });
  removeRetention = guarded(async (req, res) => { res.json(await retentionService.remove(req.user!, req.params.entityType)); });
  runRetention = guarded(async (req, res) => { res.json(await retentionService.run(req.user!, T.RunRetentionSchema.parse(req.body ?? {}))); });

  // API reference
  apiReference = guarded(async (req, res) => {
    if (!req.user!.permissions.includes('admin:api:view')) throw new ForbiddenError('Forbidden: admin:api:view permission required');
    res.json(listEndpoints((req.app.locals.apiMounts ?? []) as Mount[]));
  });
}

export const adminController = new AdminController();
