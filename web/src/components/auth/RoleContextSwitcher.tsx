import { ChevronDown, Briefcase } from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '@stores/authStore';
import { useRoleAware } from '@stores/roleAwareStore';
import type { UserOrganizationContext, OrganizationLevel } from '@/types/auth';

const levelLabels: Record<OrganizationLevel, string> = {
  'CONFERENCE': 'Conference',
  'DISTRICT': 'District',
  'CIRCUIT': 'Circuit',
  'SECTION': 'Section',
};

const roleLabels: Record<string, string> = {
  'CONFERENCE_LEADER': 'Conference Leader',
  'DISTRICT_LEADER': 'District Leader',
  'DISTRICT_ORGANIZATION_LEADER': 'District Organization Leader',
  'CIRCUIT_LEADER': 'Circuit Leader',
  'CIRCUIT_ORGANIZATION_LEADER': 'Circuit Organization Leader',
  'SECTION_LEADER': 'Section Leader',
  'MEMBER': 'Member',
};

export const RoleContextSwitcher = () => {
  const { user, switchContext, currentContextId } = useAuthStore();
  const { getCurrentContext, isMultiRoleUser } = useRoleAware();
  const [isOpen, setIsOpen] = useState(false);

  if (!user || !isMultiRoleUser()) {
    return null;
  }

  const currentContext = getCurrentContext();
  if (!currentContext) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
      >
        <Briefcase className="h-4 w-4" />
        <div className="text-left">
          <div className="text-xs uppercase tracking-wide text-gray-500">{levelLabels[currentContext.organizationLevel]}</div>
          <div className="font-medium text-gray-900">{roleLabels[currentContext.role] || currentContext.role}</div>
        </div>
        <ChevronDown className="h-4 w-4 text-gray-500" />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-2 w-80 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <div className="border-b border-gray-100 px-4 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Switch Role</p>
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto px-1 py-1">
            {user.organizationContexts.map((context) => (
              <button
                key={context.roleId}
                onClick={() => {
                  switchContext(context.roleId);
                  setIsOpen(false);
                }}
                className={`flex w-full flex-col gap-1 rounded-md px-3 py-2 text-left text-sm transition ${
                  currentContextId === context.roleId
                    ? 'bg-primary-50'
                    : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">{roleLabels[context.role] || context.role}</span>
                  <span className="text-xs uppercase tracking-wide text-gray-500">{levelLabels[context.organizationLevel]}</span>
                </div>
                <span className="text-xs text-gray-600">{context.organizationName}</span>
                {currentContextId === context.roleId && <span className="text-xs font-semibold text-primary-600">✓ Current</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
