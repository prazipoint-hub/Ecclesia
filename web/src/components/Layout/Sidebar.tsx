import { useOrganizationStore } from '@stores/organizationStore';
import { type LucideIcon, BarChart3, BookOpen, Building2, Calendar, FileText, Home, Layers3, ShieldCheck, Users, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const circuitNavigation: Array<{ name: string; href: string; icon: LucideIcon }> = [
  { name: 'Dashboard', href: '/', icon: Home },
  { name: 'Members', href: '/members', icon: Users },
  { name: 'Families', href: '/membership', icon: BookOpen },
  { name: 'Committees', href: '/events', icon: Layers3 },
  { name: 'Organizations', href: '/finance', icon: Building2 },
  { name: 'Finance', href: '/reports', icon: BarChart3 },
  { name: 'Reports', href: '/settings', icon: FileText },
  { name: 'Church Records', href: '/district', icon: Calendar },
  { name: 'Settings', href: '/settings', icon: ShieldCheck },
];

const districtNavigation: Array<{ name: string; href: string; icon: LucideIcon }> = [
  { name: 'Dashboard', href: '/district', icon: Home },
  { name: 'Circuits', href: '/district/circuits', icon: Building2 },
  { name: 'Members', href: '/members', icon: Users },
  { name: 'Leadership', href: '/district/committees', icon: ShieldCheck },
  { name: 'Programs', href: '/district/programs', icon: Calendar },
  { name: 'District Finance', href: '/finance', icon: BarChart3 },
  { name: 'District Reports', href: '/district/reports', icon: FileText },
  { name: 'Users', href: '/settings', icon: Users },
  { name: 'Settings', href: '/settings', icon: ShieldCheck },
];

export const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  const location = useLocation();
  const { scope } = useOrganizationStore();
  const navigation = scope === 'DISTRICT' ? districtNavigation : circuitNavigation;

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black bg-opacity-50 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-40 h-screen w-64 bg-gray-900 pt-20 text-white transition-transform duration-200 lg:translate-x-0 lg:pt-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-4 lg:hidden">
          <h2 className="text-xl font-bold">{scope === 'DISTRICT' ? 'District' : 'Circuit'} Tools</h2>
          <button onClick={onClose} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="space-y-2 px-4">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href || (item.href === '/district' && location.pathname.startsWith('/district'));

            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={onClose}
                className={`flex items-center gap-3 rounded-lg px-4 py-3 transition-colors ${
                  isActive
                    ? 'bg-primary-500 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;
