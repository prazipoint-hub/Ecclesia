import { useAuthStore } from '@stores/authStore';
import { useRoleAware } from '@stores/roleAwareStore';
import { MainLayout } from '@/components/Layout/MainLayout';
import { Card, CardContent, CardHeader } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { RoleContextSwitcher } from '@/components/auth/RoleContextSwitcher';
import { ArrowRight, Briefcase } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const roleRoutes: Record<string, string> = {
  'DISTRICT_LEADER': '/district',
  'DISTRICT_ORGANIZATION_LEADER': '/district/management',
  'CIRCUIT_LEADER': '/circuit',
  'CIRCUIT_ORGANIZATION_LEADER': '/circuit/management',
  'SECTION_LEADER': '/section',
  'CONFERENCE_LEADER': '/conference',
};

export const RoleDashboard = () => {
  const { user, currentContextId } = useAuthStore();
  const { getCurrentContext, isMultiRoleUser, getAllContexts } = useRoleAware();
  const navigate = useNavigate();
  const currentContext = getCurrentContext();

  if (!user) {
    return null;
  }

  const getNavigationUrl = (role: string): string => {
    return roleRoutes[role] || '/dashboard';
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Welcome, {user.firstName} {user.lastName}</h1>
              <p className="mt-2 text-gray-600">
                {currentContext ? (
                  <>
                    You are logged in as <span className="font-semibold">{currentContext.role}</span> for{' '}
                    <span className="font-semibold">{currentContext.organizationName}</span>
                  </>
                ) : (
                  'No active role assigned'
                )}
              </p>
            </div>
            {isMultiRoleUser() && <RoleContextSwitcher />}
          </div>
        </div>

        {isMultiRoleUser() && (
          <div className="grid gap-6">
            <div>
              <h2 className="mb-4 text-xl font-bold text-gray-900">Your Roles & Dashboards</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {getAllContexts().map((context) => {
                  const isActive = currentContextId === context.roleId;
                  const navigationUrl = getNavigationUrl(context.role);

                  return (
                    <Card key={context.roleId} className={isActive ? 'border-primary-500 ring-1 ring-primary-500' : ''}>
                      <CardHeader className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold text-gray-900">{context.role}</h3>
                          <p className="mt-1 text-sm text-gray-500">{context.organizationName}</p>
                        </div>
                        <Briefcase className={`h-5 w-5 ${isActive ? 'text-primary-600' : 'text-gray-400'}`} />
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-gray-500">Level</p>
                          <p className="mt-1 font-medium text-gray-900">{context.organizationLevel}</p>
                        </div>
                        <Button
                          onClick={() => {
                            if (!isActive) {
                              useAuthStore.getState().switchContext(context.roleId);
                            }
                            navigate(navigationUrl);
                          }}
                          variant={isActive ? 'primary' : 'secondary'}
                          className="w-full"
                        >
                          {isActive ? 'Active' : 'Switch to'} Role
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {!isMultiRoleUser() && currentContext && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-bold text-gray-900">Your Dashboard</h2>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">You have one active role as {currentContext.role}.</p>
              <Button
                onClick={() => navigate(getNavigationUrl(currentContext.role))}
                variant="primary"
                className="mt-4"
              >
                Go to Dashboard
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
};
