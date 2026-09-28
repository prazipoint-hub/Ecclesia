import { create } from 'zustand';
import { apiClient } from '@/utils/api';
import type { AuthState, LoginRequest, RegisterRequest, User } from '@/types/auth';

interface AuthStore extends AuthState {
  login: (credentials: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  setUser: (user: User | null) => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null, token: localStorage.getItem('token'), isAuthenticated: Boolean(localStorage.getItem('token')), isLoading: false, error: null,
  login: async (credentials) => { set({ isLoading: true, error: null }); try { const { data } = await apiClient.post('/api/v1/auth/login', credentials); localStorage.setItem('token', data.token); set({ user: data.user, token: data.token, isAuthenticated: true, isLoading: false }); } catch (error: any) { set({ error: error.response?.data?.error?.message || 'Login failed', isLoading: false }); throw error; } },
  register: async (data) => { set({ isLoading: true, error: null }); try { const response = await apiClient.post('/api/v1/auth/register', data); localStorage.setItem('token', response.data.token); set({ user: response.data.user, token: response.data.token, isAuthenticated: true, isLoading: false }); } catch (error: any) { set({ error: error.response?.data?.error?.message || 'Registration failed', isLoading: false }); throw error; } },
  logout: () => { localStorage.removeItem('token'); set({ user: null, token: null, isAuthenticated: false }); },
  clearError: () => set({ error: null }),
  setUser: (user) => set({ user }),
  checkAuth: async () => { const token = localStorage.getItem('token'); if (!token) { set({ isLoading: false, isAuthenticated: false }); return; } set({ isLoading: true }); try { const { data } = await apiClient.get('/api/v1/auth/me'); set({ user: data.user ?? data, isAuthenticated: true, isLoading: false }); } catch { localStorage.removeItem('token'); set({ user: null, token: null, isAuthenticated: false, isLoading: false }); } },
}));
