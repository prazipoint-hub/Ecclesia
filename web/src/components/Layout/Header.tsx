import { ChevronDown, LogOut, Menu, Search, Settings } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import { useAuthStore } from '@stores/authStore';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { OrganizationSwitcher } from '@/components/hierarchy/OrganizationSwitcher';

interface HeaderProps {
  onMenuClick: () => void;
}

export const Header = ({ onMenuClick }: HeaderProps) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleLogout = async () => {
    await logout();
    navigate('/auth/login');
  };

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200/80 bg-white/90 backdrop-blur-xl lg:ml-72">
      <div className="px-4 py-3 sm:px-6 lg:px-8 xl:px-10">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onMenuClick}
              className="icon-button lg:hidden"
              aria-label={t('header.toggleMenu')}
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden md:block">
              <OrganizationSwitcher />
            </div>
            <div className="hidden items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-500 xl:flex">
              <Search className="h-4 w-4" />
              <span>Search workspace</span>
              <kbd className="ml-5 rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">⌘ K</kbd>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <div className="hidden sm:block"><LanguageSwitcher /></div>
            <NotificationBell />
            <div className="relative">
              <button
                onClick={() => setShowUserMenu((prev) => !prev)}
                className="flex min-h-11 items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-gray-50"
                aria-expanded={showUserMenu}
                aria-haspopup="menu"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 font-semibold text-white shadow-sm">
                  {user?.firstName?.charAt(0) || 'U'}
                </div>
                <span className="hidden text-left sm:block">
                  <span className="block text-sm font-semibold leading-tight text-gray-900">{user?.firstName} {user?.lastName}</span>
                  <span className="block text-xs text-gray-500">Account</span>
                </span>
                <ChevronDown className="hidden h-4 w-4 text-gray-400 sm:block" />
              </button>

              {showUserMenu && (
                <div role="menu" className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white p-1.5 shadow-lift">
                  <button
                    onClick={() => navigate('/settings')}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    <Settings className="h-4 w-4" />
                    {t('header.settings')}
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-50"
                  >
                    <LogOut className="h-4 w-4" />
                    {t('header.logout')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
