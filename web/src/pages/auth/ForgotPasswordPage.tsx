import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { FormField } from '@/components/forms/FormField';
import { apiClient } from '@/utils/api';
import { getApiErrorMessage } from '@/utils/apiError';
import { AuthShell, ErrorNotice, SuccessNotice, primaryButtonClass } from './AuthShell';

export const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');

  const request = useMutation({
    mutationFn: async (address: string) => {
      const { data } = await apiClient.post<{ message?: string }>('/api/v1/auth/password-reset/request', { email: address });
      return data;
    },
  });

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    request.mutate(email.trim().toLowerCase());
  };

  return (
    <AuthShell title="Forgot password" subtitle="Enter your account email and we will send you a link to reset your password.">
      {request.isSuccess ? (
        <SuccessNotice message={request.data?.message ?? 'If an account exists for that email, a reset link is on its way.'} />
      ) : (
        <form onSubmit={onSubmit} className="space-y-5" noValidate={false}>
          {request.isError && <ErrorNotice message={getApiErrorMessage(request.error, 'We could not send the reset link. Please try again.')} />}
          <FormField label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={request.isPending} />
          <button type="submit" className={primaryButtonClass} disabled={request.isPending}>
            {request.isPending ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
    </AuthShell>
  );
};
