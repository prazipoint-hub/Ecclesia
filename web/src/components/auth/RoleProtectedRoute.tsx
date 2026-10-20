import { useAuthStore } from '@stores/authStore';
import { useRoleAware } from '@stores/roleAwareStore';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

interface RoleProtectedRouteProps {
  children: ReactNode;
  requiredRoles?: string[];
  requiredLevel?: string;
  requireMultiRole?: boolean;
}

export const RoleProtectedRoute = ({
  children,
  requiredRoles,
  requiredLevel,
  requireMultiRole = false,
}: RoleProtectedRouteProps) => {
  const { isAuthenticated, isLoading } = useAuthStore();
  const { getCurrentContext, hasRole, hasRoleAtLevel, isMultiRoleUser } = useRoleAware();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-primary-500" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />;
  }

  if (requireMultiRole && !isMultiRoleUser()) {
    return <Navigate to="/dashboard" replace />;
  }

  if (requiredRoles) {
    const hasRequiredRole = requiredRoles.some((role) => hasRole(role));
    if (!hasRequiredRole) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  if (requiredLevel) {
    const context = getCurrentContext();
    if (!context || context.organizationLevel !== requiredLevel) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
};
