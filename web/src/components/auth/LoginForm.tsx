import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import { useAuthStore } from '@/stores/authStore';

export const LoginForm = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, error, clearError, requiresTwoFactor, cancelTwoFactor } = useAuthStore();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearError();
    setIsSubmitting(true);
    try {
      await login({ email, password, ...(requiresTwoFactor ? { totpCode: totpCode.trim() } : {}) });
      navigate('/');
    } catch {
      // The store exposes the failure through `error` / `requiresTwoFactor`.
    } finally {
      setIsSubmitting(false);
    }
  };

  const backToCredentials = () => {
    setTotpCode('');
    cancelTwoFactor();
  };

  return (
    <div className="w-full max-w-md rounded-lg border border-gray-200/80 bg-white p-7 shadow-lg sm:p-9">
      <div className="mb-4 flex justify-end"><LanguageSwitcher /></div>
      <div className="mb-8">
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-primary-700">Welcome to Ecclesia</p>
        <h1 className="text-2xl font-medium text-gray-950">{requiresTwoFactor ? t('login.twoFactorTitle') : t('login.welcome')}</h1>
        <p className="mt-2 text-gray-600">
          {requiresTwoFactor ? t('login.twoFactorSubtitle') : t('login.subtitle')}
        </p>
      </div>

      {error && (
        <div role="alert" className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {requiresTwoFactor ? (
          <label className="block text-sm font-medium text-gray-700">
            {t('login.code')}
            <input
              className="mt-1 block w-full rounded-lg border-gray-300 tracking-widest"
              type="text"
              inputMode="text"
              autoComplete="one-time-code"
              autoFocus
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              required
              disabled={isSubmitting}
            />
          </label>
        ) : (
          <>
            <label className="block text-sm font-medium text-gray-700">
              {t('login.email')}
              <input className="mt-2 block w-full rounded-md border-gray-200" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={isSubmitting} />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              {t('login.password')}
              <input className="mt-2 block w-full rounded-md border-gray-200" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={isSubmitting} />
            </label>
            <div className="text-right">
              <Link to="/auth/forgot-password" className="text-sm font-medium text-primary-600 hover:text-primary-700">
                {t('login.forgot')}
              </Link>
            </div>
          </>
        )}
        <button className="min-h-12 w-full rounded-md bg-primary-600 px-4 py-3 font-medium text-white shadow-md shadow-primary-600/20 hover:bg-primary-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('login.signingIn') : requiresTwoFactor ? t('login.verify') : t('login.signIn')}
        </button>
        {requiresTwoFactor && (
          <button type="button" onClick={backToCredentials} disabled={isSubmitting} className="w-full text-sm font-medium text-gray-600 hover:text-gray-900">
            {t('login.back')}
          </button>
        )}
      </form>
    </div>
  );
};
