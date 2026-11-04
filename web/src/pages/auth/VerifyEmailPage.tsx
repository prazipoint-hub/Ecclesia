import { useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import { AuthShell, ErrorNotice, SuccessNotice, primaryButtonClass } from './AuthShell';

export const VerifyEmailPage = () => {
  const [params] = useSearchParams();
  const token = params.get('token');
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const started = useRef(false);

  const verify = useMutation({
    mutationFn: async (value: string) => {
      const { data } = await apiClient.post<{ message?: string }>('/api/v1/auth/email/verify', { token: value });
      return data;
    },
  });

  const resend = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<{ message?: string }>('/api/v1/auth/email/resend-verification');
      return data;
    },
  });

  useEffect(() => {
    // StrictMode double-invokes effects in development; a verification token is single-use.
    if (!token || started.current) return;
    started.current = true;
    verify.mutate(token);
  }, [token, verify]);

  return (
    <AuthShell title="Verify email">
      {!token ? (
        <ErrorNotice message="This verification link is missing its token. Open the link from your email again." />
      ) : verify.isSuccess ? (
        <>
          <SuccessNotice message={verify.data?.message ?? 'Your email address has been verified.'} />
          <Link to={isAuthenticated ? '/' : '/auth/login'} className={`${primaryButtonClass} block text-center`}>
            Continue
          </Link>
        </>
      ) : verify.isError ? (
        <>
          <ErrorNotice message={getApiErrorMessage(verify.error, 'We could not verify your email. The link may have expired.')} />
          {isAuthenticated && (
            <>
              {resend.isSuccess && <SuccessNotice message={resend.data?.message ?? 'A new verification email has been sent.'} />}
              {resend.isError && <ErrorNotice message={getApiErrorMessage(resend.error)} />}
              <button type="button" className={primaryButtonClass} onClick={() => resend.mutate()} disabled={resend.isPending}>
                {resend.isPending ? 'Sending…' : 'Send a new verification email'}
              </button>
            </>
          )}
        </>
      ) : (
        <div role="status" className="flex items-center gap-3 text-gray-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          Verifying your email…
        </div>
      )}
    </AuthShell>
  );
};
