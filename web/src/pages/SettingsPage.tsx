import { ChevronRight, KeyRound, LogOut, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
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
      <div className="mx-auto max-w-4xl space-y-7">
        <div>
          <p className="page-eyebrow">Account</p>
          <h1 className="mt-2 text-2xl font-medium text-gray-950 sm:text-2xl">Settings</h1>
          <p className="mt-2 max-w-2xl text-gray-600">Manage your personal account, security and workspace access.</p>
        </div>
        <section className="overflow-hidden rounded-lg border border-gray-200/80 bg-white shadow-card">
          <div className="border-b border-gray-100 bg-gradient-to-r from-primary-50 to-amber-50/60 px-5 py-4 sm:px-6">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-800"><UserRound className="h-4 w-4 text-primary-700" /> Account profile</div>
          </div>
          <div className="p-5 sm:p-6">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary-600 text-xl font-medium text-white shadow-sm ring-4 ring-primary-50">
              {user?.firstName?.charAt(0) ?? 'U'}
            </span>
            <div>
              <h2 className="font-medium text-gray-900">
                {user?.firstName} {user?.lastName}
              </h2>
              <p className="text-sm text-gray-500">Signed-in account</p>
            </div>
          </div>
          <dl className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-md border border-gray-100 bg-gray-50/70 p-4">
              <Mail className="h-5 w-5 text-primary-600" />
              <div>
                <dt className="text-sm text-gray-500">Email</dt>
                <dd className="font-medium text-gray-900">{user?.email ?? '—'}</dd>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-md border border-gray-100 bg-gray-50/70 p-4">
              <ShieldCheck className="h-5 w-5 text-primary-600" />
              <div>
                <dt className="text-sm text-gray-500">Granted permissions</dt>
                <dd className="font-medium text-gray-900">{user?.permissions.length ?? 0}</dd>
              </div>
            </div>
          </dl>
          </div>
        </section>
        <Link
          to="/settings/security"
          className="group flex min-h-24 items-center justify-between rounded-lg border border-gray-200/80 bg-white p-5 shadow-card hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-lg sm:p-6"
        >
          <span className="flex items-center gap-3">
            <span className="rounded-md bg-primary-50 p-3 text-primary-700"><KeyRound className="h-5 w-5" /></span>
            <span>
              <span className="block font-medium text-gray-900">Security</span>
              <span className="block text-sm text-gray-500">Password, devices and two-factor authentication</span>
            </span>
          </span>
          <ChevronRight className="h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-1 group-hover:text-primary-600" />
        </Link>
        <button
          type="button"
          onClick={signOut}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-red-200 bg-white px-4 py-2.5 font-medium text-red-700 shadow-sm hover:bg-red-50"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </MainLayout>
  );
};
