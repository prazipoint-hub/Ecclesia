import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle2, Church } from 'lucide-react';

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export const AuthShell = ({ title, subtitle, children }: AuthShellProps) => (
  <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-primary-950 px-4 py-10 sm:px-6">
    <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_30rem),radial-gradient(circle_at_bottom_right,rgba(124,58,237,0.5),transparent_34rem)]" />
    <div aria-hidden="true" className="absolute left-[8%] top-[12%] h-48 w-48 rounded-full border border-white/10" />
    <div className="relative w-full max-w-md">
      <div className="mb-6 flex items-center justify-center gap-3 text-white">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15 backdrop-blur">
          <Church className="h-6 w-6 text-amber-300" />
        </span>
        <div>
          <p className="font-display text-lg font-semibold leading-tight">Ecclesia</p>
          <p className="text-xs text-primary-200">Church management, thoughtfully connected</p>
        </div>
      </div>
      <div className="rounded-3xl border border-white/40 bg-white p-6 shadow-2xl shadow-black/20 sm:p-8">
        <p className="page-eyebrow">Secure account access</p>
        <h1 className="mt-2 text-3xl font-semibold text-gray-950">{title}</h1>
        {subtitle && <p className="mt-2 leading-relaxed text-gray-600">{subtitle}</p>}
        <div className="mt-7 space-y-5">{children}</div>
        <p className="mt-7 border-t border-gray-100 pt-5 text-center text-sm">
          <Link to="/auth/login" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 font-semibold text-primary-700 hover:bg-primary-50 hover:text-primary-900">
            <ArrowLeft className="h-4 w-4" /> Back to sign in
          </Link>
        </p>
      </div>
    </div>
  </main>
);

export const ErrorNotice = ({ message }: { message: string }) => (
  <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
    <span className="rounded-lg bg-red-100 p-1.5"><AlertCircle className="h-4 w-4 shrink-0" /></span>
    <span>{message}</span>
  </div>
);

export const SuccessNotice = ({ message }: { message: string }) => (
  <div role="status" className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
    <span className="rounded-lg bg-green-100 p-1.5"><CheckCircle2 className="h-4 w-4 shrink-0" /></span>
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
  'inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-primary-600 px-4 py-3 font-semibold text-white shadow-sm hover:bg-primary-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60';
