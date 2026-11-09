import { apiClient } from '@/utils/api';

/**
 * View-As support. The server issues a 15-minute READ-ONLY token and rejects every write made with it; this file only
 * keeps the admin's real token aside so "Exit" can put it back. Nothing here grants access.
 */
const BACKUP_KEY = 'previewBackupToken';
export interface PreviewInfo { roleId: string; roleName: string; expiresAt: number | null }

export const readPreview = (token = localStorage.getItem('token')): PreviewInfo | null => {
  try {
    if (!token) return null;
    const part = token.split('.')[1];
    if (!part) return null;
    const claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { preview?: { roleId?: string; roleName?: string }; exp?: number };
    if (!claims.preview?.roleId) return null;
    return { roleId: claims.preview.roleId, roleName: claims.preview.roleName ?? 'a role', expiresAt: claims.exp ? claims.exp * 1000 : null };
  } catch { return null; }
};

export const startPreview = async (roleId: string) => {
  const real = localStorage.getItem('token');
  const { data } = await apiClient.post<{ token: string }>('/api/v2/access/preview', { roleId });
  if (real) sessionStorage.setItem(BACKUP_KEY, real);
  localStorage.setItem('token', data.token);
  window.location.assign('/dashboard');
};

export const exitPreview = async () => {
  try { await apiClient.post('/api/v2/access/preview/exit'); } catch { /* the token may already have expired; still leave */ }
  const real = sessionStorage.getItem(BACKUP_KEY);
  sessionStorage.removeItem(BACKUP_KEY);
  if (real) localStorage.setItem('token', real);
  window.location.assign(real ? '/dashboard' : '/login');
};
