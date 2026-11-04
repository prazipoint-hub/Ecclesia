import { useAuthStore } from '@stores/authStore';
import type { Permission } from '@/types/permissions';

export const usePermissions = () => {
  const { user } = useAuthStore();

  const hasPermission = (resource: string, permission: Permission): boolean => {
    if (!user) return false;
    return user.permissions.includes(`${resource}:${permission.toLowerCase()}`);
  };

  const hasAnyPermission = (resource: string, permissions: Permission[]): boolean => {
    if (!user) return false;
    return permissions.some((permission) => hasPermission(resource, permission));
  };

  const hasAllPermissions = (resource: string, permissions: Permission[]): boolean => {
    if (!user) return false;
    return permissions.every((permission) => hasPermission(resource, permission));
  };

  return {
    permissions: user?.permissions ?? [],
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
  };
};
