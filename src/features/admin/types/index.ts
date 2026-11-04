import { z } from 'zod';

const id = z.string().min(1);
const page = {
  skip: z.coerce.number().int().min(0).max(100_000).default(0),
  take: z.coerce.number().int().min(1).max(200).default(50),
};
const permissionName = z.string().trim().min(3).max(120).regex(/^[a-z0-9_]+(:[a-z0-9_]+)+$/, 'Permission names look like area:action');

// ------------------------------------------------------------------ roles
export const CreateRoleSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(300).optional(),
    permissions: z.array(permissionName).max(300).default([]),
  })
  .strict();
export const UpdateRoleSchema = z.object({ name: z.string().trim().min(2).max(80).optional(), description: z.string().trim().max(300).nullable().optional() }).strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export const SetRolePermissionsSchema = z.object({ permissions: z.array(permissionName).max(300) }).strict();

// ------------------------------------------------------------------ users
export const UserListQuerySchema = z.object({ q: z.string().trim().max(100).optional(), status: z.enum(['ACTIVE', 'DISABLED']).optional(), ...page });
export const DisableUserSchema = z.object({ reason: z.string().trim().min(5).max(300) }).strict();
export const AssignRoleSchema = z.object({ roleId: id, position: z.string().trim().max(100).optional() }).strict();

// ------------------------------------------------------------------ settings
export const SetSettingSchema = z.object({ value: z.unknown() }).strict();

// ------------------------------------------------------------------ audit
export const AuditQuerySchema = z.object({
  action: z.string().trim().max(100).optional(),
  entityType: z.string().trim().max(60).optional(),
  entityId: z.string().trim().max(100).optional(),
  actorId: z.string().trim().max(100).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  ...page,
});

// ------------------------------------------------------------------ retention
export const RETENTION_ENTITIES = {
  AUDIT_LOG: { minDays: 365, label: 'Audit log entries' },
  REPORT_EXECUTION: { minDays: 30, label: 'Report run history' },
  SESSION: { minDays: 1, label: 'Expired sign-in sessions' },
  TOKEN: { minDays: 1, label: 'Used or expired password-reset and verification tokens' },
} as const;
export type RetentionEntity = keyof typeof RETENTION_ENTITIES;
const entity = z.enum(Object.keys(RETENTION_ENTITIES) as [RetentionEntity, ...RetentionEntity[]]);

export const SetRetentionRuleSchema = z.object({ entityType: entity, retentionDays: z.number().int().min(1).max(3650), isActive: z.boolean().default(true) }).strict();
/** Deleting is opt-in: a run only counts what it would remove unless dryRun is explicitly false. */
export const RunRetentionSchema = z.object({ dryRun: z.boolean().default(true), entityTypes: z.array(entity).optional() }).strict();

export type CreateRoleInput = z.infer<typeof CreateRoleSchema>;
export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>;
export type UserListQuery = z.infer<typeof UserListQuerySchema>;
export type AuditQuery = z.infer<typeof AuditQuerySchema>;
export type SetRetentionRuleInput = z.infer<typeof SetRetentionRuleSchema>;
export type RunRetentionInput = z.infer<typeof RunRetentionSchema>;
