import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

export const LoginForm = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearError();
    setIsSubmitting(true);
    try {
      await login({ email, password });
      navigate('/');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
      <div className="mb-8">
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-primary-600">Ecclesia</p>
        <h1 className="text-3xl font-bold text-gray-900">Welcome back</h1>
        <p className="mt-2 text-gray-600">Sign in to manage your church community.</p>
      </div>

      {error && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block text-sm font-medium text-gray-700">
          Email
          <input className="mt-1 block w-full rounded-lg border-gray-300" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={isSubmitting} />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          Password
          <input className="mt-1 block w-full rounded-lg border-gray-300" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={isSubmitting} />
        </label>
        <button className="w-full rounded-lg bg-primary-600 px-4 py-3 font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
};
