import { useEffect } from 'react';
import { useAuthStore } from '@stores/authStore';

export const useAuth = () => {
  const { user, isAuthenticated, isLoading, error, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return { user, isAuthenticated, isLoading, error };
};
