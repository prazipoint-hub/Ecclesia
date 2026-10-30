import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FormField } from '@/components/forms/FormField';
import { useAuthStore } from '@/stores/authStore';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import type { AuthResponse } from '@/types/auth';
import { AuthShell, ErrorNotice, primaryButtonClass, validateNewPassword } from './AuthShell';

export const AcceptInvitationPage = () => {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const acceptSession = useAuthStore((state) => state.acceptSession);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [validationError, setValidationError] = useState<string>();

  const accept = useMutation({
    mutationFn: async (input: { token: string; password: string }) => {
      const { data } = await apiClient.post<AuthResponse>('/api/v1/auth/invite/accept', input);
      return data;
    },
    onSuccess: (data) => {
      acceptSession(data);
      navigate('/', { replace: true });
    },
  });

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    const problem = validateNewPassword(password, confirm);
    setValidationError(problem);
    if (problem) return;
    accept.mutate({ token, password });
  };

  if (!token) {
    return (
      <AuthShell title="Accept invitation">
        <ErrorNotice message="This invitation link is missing its token. Ask your church administrator to send a new invitation." />
        <Link to="/auth/login" className="block text-center text-sm font-medium text-primary-600 hover:text-primary-700">
          Already have an account? Sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Welcome to Ecclesia" subtitle="You have been invited. Set a password to create your account.">
      <form onSubmit={onSubmit} className="space-y-5">
        {accept.isError && <ErrorNotice message={getApiErrorMessage(accept.error, 'We could not accept this invitation. It may have expired or already been used.')} />}
        <FormField label="Password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} hint="At least 8 characters." disabled={accept.isPending} />
        <FormField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={validationError}
          disabled={accept.isPending}
        />
        <button type="submit" className={primaryButtonClass} disabled={accept.isPending}>
          {accept.isPending ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthShell>
  );
};
