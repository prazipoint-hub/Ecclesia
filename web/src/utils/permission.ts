import type { Permission } from '@/types/permissions';

export const PERMISSION_HIERARCHY: Record<Permission, number> = {
  'VIEW': 1,
  'SUBMIT': 2,
  'CREATE': 3,
  'UPDATE': 4,
  'DELETE': 5,
  'REVIEW': 6,
  'APPROVE': 7,
  'EXPORT': 8,
};

export const canPerformAction = (
  userPermissions: string[],
  resource: string,
  requiredPermission: Permission,
): boolean => {
  const permissionString = `${resource}:${requiredPermission.toLowerCase()}`;
  return userPermissions.includes(permissionString);
};

export const canPerformAny = (
  userPermissions: string[],
  resource: string,
  requiredPermissions: Permission[],
): boolean => {
  return requiredPermissions.some((permission) => canPerformAction(userPermissions, resource, permission));
};

export const canPerformAll = (
  userPermissions: string[],
  resource: string,
  requiredPermissions: Permission[],
): boolean => {
  return requiredPermissions.every((permission) => canPerformAction(userPermissions, resource, permission));
};
