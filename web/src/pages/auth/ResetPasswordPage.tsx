import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { FormField } from '@/components/forms/FormField';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import { AuthShell, ErrorNotice, SuccessNotice, primaryButtonClass, validateNewPassword } from './AuthShell';

export const ResetPasswordPage = () => {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [validationError, setValidationError] = useState<string>();

  const reset = useMutation({
    mutationFn: async (input: { token: string; password: string }) => {
      const { data } = await apiClient.post<{ message?: string }>('/api/v1/auth/password-reset/confirm', input);
      return data;
    },
  });

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    const problem = validateNewPassword(password, confirm);
    setValidationError(problem);
    if (problem) return;
    reset.mutate({ token, password });
  };

  if (!token) {
    return (
      <AuthShell title="Reset password">
        <ErrorNotice message="This reset link is missing its token. Request a new link to continue." />
        <Link to="/auth/forgot-password" className="block text-center text-sm font-medium text-primary-600 hover:text-primary-700">
          Request a new link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Use at least 8 characters.">
      {reset.isSuccess ? (
        <>
          <SuccessNotice message={reset.data?.message ?? 'Your password has been reset.'} />
          <Link to="/auth/login" className={`${primaryButtonClass} block text-center`}>
            Sign in
          </Link>
        </>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5">
          {reset.isError && <ErrorNotice message={getApiErrorMessage(reset.error, 'We could not reset your password. The link may have expired.')} />}
          <FormField label="New password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} disabled={reset.isPending} />
          <FormField
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={validationError}
            disabled={reset.isPending}
          />
          <button type="submit" className={primaryButtonClass} disabled={reset.isPending}>
            {reset.isPending ? 'Resetting…' : 'Reset password'}
          </button>
        </form>
      )}
    </AuthShell>
  );
};
