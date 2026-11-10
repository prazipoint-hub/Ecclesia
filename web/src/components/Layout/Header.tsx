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
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white lg:ml-[240px]">
      <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            className="icon-button lg:hidden"
            aria-label={t('header.toggleMenu')}
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="hidden md:block">
            <OrganizationSwitcher />
          </div>
          <div className="hidden items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-400 xl:flex">
            <Search className="h-3.5 w-3.5" />
            <span className="text-[13px]">Search…</span>
            <kbd className="ml-4 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-400">⌘K</kbd>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <div className="hidden sm:block"><LanguageSwitcher /></div>
          <NotificationBell />
          <div className="relative">
            <button
              onClick={() => setShowUserMenu((prev) => !prev)}
              className="flex h-9 items-center gap-2 rounded-md px-2 hover:bg-gray-50"
              aria-expanded={showUserMenu}
              aria-haspopup="menu"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-600 text-xs font-medium text-white">
                {user?.firstName?.charAt(0) || 'U'}
              </div>
              <span className="hidden text-left sm:block">
                <span className="block text-[13px] font-medium text-gray-700">{user?.firstName} {user?.lastName}</span>
              </span>
              <ChevronDown className="hidden h-3.5 w-3.5 text-gray-400 sm:block" />
            </button>

            {showUserMenu && (
              <div role="menu" className="absolute right-0 mt-1 w-48 overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                <button
                  onClick={() => navigate('/settings')}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-gray-700 hover:bg-gray-50"
                >
                  <Settings className="h-3.5 w-3.5" />
                  {t('header.settings')}
                </button>
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-red-600 hover:bg-gray-50"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  {t('header.logout')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
