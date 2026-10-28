import { LogOut, Mail, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/Layout/MainLayout';
import { useAuthStore } from '@/stores/authStore';

export const SettingsPage = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const signOut = () => {
    logout();
    navigate('/auth/login');
  };
  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary-600">
            Account
          </p>
          <h1 className="mt-2 text-3xl font-bold text-gray-900">Settings</h1>
          <p className="mt-2 text-gray-600">Your current account and workspace access.</p>
        </div>
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-600 text-lg font-bold text-white">
              {user?.firstName?.charAt(0) ?? 'U'}
            </span>
            <div>
              <h2 className="font-semibold text-gray-900">
                {user?.firstName} {user?.lastName}
              </h2>
              <p className="text-sm text-gray-500">Signed-in account</p>
            </div>
          </div>
          <dl className="mt-6 divide-y divide-gray-100">
            <div className="flex items-center gap-3 py-3">
              <Mail className="h-4 w-4 text-gray-500" />
              <div>
                <dt className="text-sm text-gray-500">Email</dt>
                <dd className="font-medium text-gray-900">{user?.email ?? '—'}</dd>
              </div>
            </div>
            <div className="flex items-center gap-3 py-3">
              <ShieldCheck className="h-4 w-4 text-gray-500" />
              <div>
                <dt className="text-sm text-gray-500">Granted permissions</dt>
                <dd className="font-medium text-gray-900">{user?.permissions.length ?? 0}</dd>
              </div>
            </div>
          </dl>
        </section>
        <button
          type="button"
          onClick={signOut}
          className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2.5 font-semibold text-red-700 hover:bg-red-50"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </MainLayout>
  );
};
