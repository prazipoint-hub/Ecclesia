export type Permission = 'VIEW' | 'CREATE' | 'UPDATE' | 'DELETE' | 'SUBMIT' | 'REVIEW' | 'APPROVE' | 'EXPORT';

export interface ScopedPermission {
  resource: string;
  permission: Permission;
  scopeId: string;
}
