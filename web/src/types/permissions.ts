export type Permission =
  | 'VIEW'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'SUBMIT'
  | 'REVIEW'
  | 'APPROVE'
  | 'EXPORT'
  | 'CONFIRM';

export interface ScopedPermission {
  resource: string;
  permission: Permission;
  scopeId: string;
}

export interface RolePermissions {
  CHAIR: Permission[];
  VICE_CHAIR: Permission[];
  SECRETARY: Permission[];
  TREASURER: Permission[];
  MEMBER: Permission[];
}
