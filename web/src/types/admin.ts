export interface PermissionInfo { name: string; description: string | null; area: string; grantable: boolean }
export interface RoleSummary { id: string; name: string; description: string | null; permissionCount: number; assignmentCount: number }
export interface RoleAssignee { id: string; position: string | null; startDate: string; member: { id: string; firstName: string; lastName: string; membershipNumber: string | null } }
export interface RoleDetail { id: string; name: string; description: string | null; permissions: string[]; assignmentCount: number; editable: boolean; assignees: RoleAssignee[] }

export interface AdminUserRole { assignmentId: string; roleId: string; role: string; position: string | null; since: string }
export interface AdminUser {
  id: string; email: string; emailVerified: boolean; createdAt: string; memberId: string | null; name: string | null; membershipNumber: string | null;
  twoFactorEnabled: boolean; lastSignInAt: string | null; disabled: boolean; disabledAt: string | null; disabledReason: string | null; roles: AdminUserRole[];
}
export interface AdminUserList { items: AdminUser[]; total: number }

export interface SystemSettingRow {
  key: string; category: string; description: string; usedBy: string; default: number; value: number; isDefault: boolean; updatedAt: string | null; updatedBy: string | null;
}

export interface AuditRow { id: string; action: string; entityType: string; entityId: string; actorId: string; actorName: string | null; changes: string | null; reason: string | null; timestamp: string }
export interface AuditList { items: AuditRow[]; total: number }

export interface RetentionEntityRow {
  entityType: string; minDays: number; label: string;
  rule: { retentionDays: number; isActive: boolean; lastRunAt: string | null; lastPurged: number | null } | null;
}
export interface RetentionRunResult { dryRun: boolean; results: Array<{ entityType: string; retentionDays: number; cutoff: string; wouldRemove?: number; removed?: number }> }

export interface EndpointInfo { method: string; path: string; authenticated: boolean; permission: string | null; params: string[] }
