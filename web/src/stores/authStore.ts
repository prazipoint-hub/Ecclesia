import { create } from 'zustand';
import { apiClient } from '@/utils/api';
import type { AuthState, LoginRequest, RegisterRequest, User, UserOrganizationContext } from '@/types/auth';

interface AuthStore extends AuthState {
  login: (credentials: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  setUser: (user: User | null) => void;
  checkAuth: () => Promise<void>;
  switchContext: (contextId: string) => void;
  getCurrentContext: () => UserOrganizationContext | null;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  token: localStorage.getItem('token'),
  refreshToken: localStorage.getItem('refreshToken'),
  isAuthenticated: Boolean(localStorage.getItem('token')),
  isLoading: false,
  error: null,
  currentContextId: localStorage.getItem('currentContextId') || undefined,

  login: async (credentials) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await apiClient.post('/api/v1/auth/login', credentials);
      localStorage.setItem('token', data.token);
      localStorage.setItem('refreshToken', data.refreshToken);
      set({ user: data.user, token: data.token, refreshToken: data.refreshToken, isAuthenticated: true, currentContextId: data.user.defaultContextId });
      if (data.user.defaultContextId) {
        localStorage.setItem('currentContextId', data.user.defaultContextId);
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Login failed' });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  register: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.post('/api/v1/auth/register', data);
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('refreshToken', response.data.refreshToken);
      set({ user: response.data.user, token: response.data.token, refreshToken: response.data.refreshToken, isAuthenticated: true, currentContextId: response.data.user.defaultContextId });
      if (response.data.user.defaultContextId) {
        localStorage.setItem('currentContextId', response.data.user.defaultContextId);
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Registration failed' });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    try {
      await apiClient.post('/api/v1/auth/logout');
    } catch {
      // The local session must still be cleared if the server is unreachable.
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('currentContextId');
      set({ user: null, token: null, refreshToken: null, isAuthenticated: false, currentContextId: undefined });
    }
  },

  clearError: () => set({ error: null }),

  setUser: (user) => set({ user }),

  checkAuth: async () => {
    const token = localStorage.getItem('token');
    const refreshToken = localStorage.getItem('refreshToken');
    if (!token && !refreshToken) {
      set({ isLoading: false, isAuthenticated: false });
      return;
    }
    set({ isLoading: true });
    try {
      const { data } = await apiClient.get('/api/v1/auth/me');
      const contextId = localStorage.getItem('currentContextId') || data.defaultContextId;
      set({ user: data, isAuthenticated: true, currentContextId: contextId });
    } catch {
      try {
        if (!refreshToken) throw new Error('No refresh token available');
        const { data: refreshed } = await apiClient.post('/api/v1/auth/refresh', { refreshToken });
        localStorage.setItem('token', refreshed.token);
        localStorage.setItem('refreshToken', refreshed.refreshToken);
        const { data: user } = await apiClient.get('/api/v1/auth/me');
        const contextId = localStorage.getItem('currentContextId') || user.defaultContextId;
        set({ user, token: refreshed.token, refreshToken: refreshed.refreshToken, isAuthenticated: true, currentContextId: contextId });
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('currentContextId');
        set({ isAuthenticated: false, user: null, token: null, refreshToken: null, currentContextId: undefined });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  switchContext: (contextId: string) => {
    const { user } = get();
    if (!user) return;

    const contextExists = user.organizationContexts.some((ctx) => ctx.roleId === contextId);
    if (!contextExists) return;

    localStorage.setItem('currentContextId', contextId);
    set({ currentContextId: contextId });
  },

  getCurrentContext: () => {
    const { user, currentContextId } = get();
    if (!user || !currentContextId) return null;
    return user.organizationContexts.find((ctx) => ctx.roleId === currentContextId) || null;
  },
}));
