import type { ReactNode } from 'react';
import type { Permission, ScopedPermission } from '@/types/permissions';

interface PermissionGateProps {
  resource: string;
  required: Permission[];
  permissions: ScopedPermission[];
  scopeId?: string;
  children: ReactNode;
  fallback?: ReactNode;
}

export const PermissionGate = ({
  resource,
  required,
  permissions,
  scopeId,
  children,
  fallback,
}: PermissionGateProps) => {
  const hasAccess = required.every((permission) =>
    permissions.some(
      (entry) =>
        entry.resource === resource &&
        entry.permission === permission &&
        (!scopeId || entry.scopeId === scopeId),
    ),
  );

  if (!hasAccess) {
    return <>{fallback ?? <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Access restricted to approved district permissions.</div>}</>;
  }

  return <>{children}</>;
};
