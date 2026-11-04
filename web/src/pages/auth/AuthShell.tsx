import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export const AuthShell = ({ title, subtitle, children }: AuthShellProps) => (
  <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-700 via-primary-600 to-primary-900 px-4">
    <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
      <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-primary-600">Ecclesia</p>
      <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
      {subtitle && <p className="mt-2 text-gray-600">{subtitle}</p>}
      <div className="mt-6 space-y-5">{children}</div>
      <p className="mt-6 text-center text-sm">
        <Link to="/auth/login" className="font-medium text-primary-600 hover:text-primary-700">
          Back to sign in
        </Link>
      </p>
    </div>
  </main>
);

export const ErrorNotice = ({ message }: { message: string }) => (
  <div role="alert" className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
    <span>{message}</span>
  </div>
);

export const SuccessNotice = ({ message }: { message: string }) => (
  <div role="status" className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
    <span>{message}</span>
  </div>
);

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export const validateNewPassword = (password: string, confirm: string): string | undefined => {
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Password must be at most ${PASSWORD_MAX} characters.`;
  if (password !== confirm) return 'Passwords do not match.';
  return undefined;
};

export const primaryButtonClass =
  'w-full rounded-lg bg-primary-600 px-4 py-3 font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60';
