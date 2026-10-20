import { LogOut, Menu, Settings } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@stores/authStore';
import { OrganizationSwitcher } from '@/components/hierarchy/OrganizationSwitcher';

interface HeaderProps {
  onMenuClick: () => void;
}

export const Header = ({ onMenuClick }: HeaderProps) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/auth/login');
  };

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white shadow-sm">
      <div className="px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onMenuClick}
              className="rounded-lg p-2 hover:bg-gray-100 lg:hidden"
              aria-label="Toggle menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden md:block">
              <OrganizationSwitcher />
            </div>
            <h1 className="text-2xl font-bold text-primary-600">Ecclesia</h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <button
                onClick={() => setShowUserMenu((prev) => !prev)}
                className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-gray-50"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-500 font-semibold text-white">
                  {user?.firstName?.charAt(0) || 'U'}
                </div>
                <span className="hidden text-sm font-medium sm:block">
                  {user?.firstName} {user?.lastName}
                </span>
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  <button
                    onClick={() => navigate('/settings')}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    <Settings className="h-4 w-4" />
                    Settings
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-50"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
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
