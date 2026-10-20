import { create } from 'zustand';
import { useAuthStore } from '@stores/authStore';
import type { UserOrganizationContext, OrganizationLevel } from '@/types/auth';

interface RoleAwareStore {
  getCurrentContext: () => UserOrganizationContext | null;
  getCurrentLevel: () => OrganizationLevel | null;
  hasRole: (role: string) => boolean;
  hasRoleAtLevel: (role: string, level: OrganizationLevel) => boolean;
  getAllContexts: () => UserOrganizationContext[];
  getContextsByLevel: (level: OrganizationLevel) => UserOrganizationContext[];
  isMultiRoleUser: () => boolean;
}

export const useRoleAware = create<RoleAwareStore>(() => ({
  getCurrentContext: () => {
    const store = useAuthStore.getState();
    return store.getCurrentContext();
  },

  getCurrentLevel: () => {
    const context = useAuthStore.getState().getCurrentContext();
    return context?.organizationLevel || null;
  },

  hasRole: (role: string) => {
    const store = useAuthStore.getState();
    const context = store.getCurrentContext();
    return context?.role === role;
  },

  hasRoleAtLevel: (role: string, level: OrganizationLevel) => {
    const store = useAuthStore.getState();
    const user = store.user;
    if (!user) return false;
    return user.organizationContexts.some((ctx) => ctx.role === role && ctx.organizationLevel === level);
  },

  getAllContexts: () => {
    const user = useAuthStore.getState().user;
    return user?.organizationContexts || [];
  },

  getContextsByLevel: (level: OrganizationLevel) => {
    const user = useAuthStore.getState().user;
    if (!user) return [];
    return user.organizationContexts.filter((ctx) => ctx.organizationLevel === level);
  },

  isMultiRoleUser: () => {
    const user = useAuthStore.getState().user;
    return user ? user.organizationContexts.length > 1 : false;
  },
}));
