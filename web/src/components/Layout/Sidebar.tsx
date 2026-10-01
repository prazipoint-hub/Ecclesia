import { Link, useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { BarChart3, BookOpen, Building2, Calendar, FileText, FolderKanban, Home, Layers3, Settings, ShieldCheck, Users, X } from 'lucide-react';
import { useOrganizationStore } from '@stores/organizationStore';

interface SidebarProps { isOpen: boolean; onClose: () => void; }
const item = (name: string, href: string, icon: LucideIcon) => ({ name, href, icon });

export const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  const location = useLocation();
  const { scope, selectedUnitId, getSbusForScope } = useOrganizationStore();
  const scopePrefix = scope.toLowerCase();
  const navigation = [
    item('Dashboard', `/${scopePrefix}`, Home),
    ...(scope === 'CONFERENCE' ? [item('Districts', '/conference/districts', Building2)] : []),
    ...(scope === 'DISTRICT' ? [item('Circuits', '/district/circuits', Building2)] : []),
    item('Members', '/members', Users),
    item('Committees', `/${scopePrefix}/committees`, Layers3),
    ...getSbusForScope(selectedUnitId).map((sbu) => item(sbu.name, `/${scopePrefix}/sbus/${sbu.id}`, Building2)),
    item('Reports', `/${scopePrefix}/reports`, FileText),
    item('Finance', '/finance', BarChart3),
    item('Events', '/events', Calendar),
    item('Settings', '/settings', Settings),
  ];

  return <>
    {isOpen && <div className="fixed inset-0 z-30 bg-black bg-opacity-50 lg:hidden" onClick={onClose} />}
    <aside className={`fixed left-0 top-0 z-40 h-screen w-72 overflow-y-auto bg-gray-900 pt-20 text-white transition-transform duration-200 lg:translate-x-0 lg:pt-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex items-center justify-between px-4 py-4 lg:hidden"><h2 className="text-xl font-bold">{scope} Tools</h2><button onClick={onClose} aria-label="Close menu"><X className="h-5 w-5" /></button></div>
      <nav className="space-y-2 px-4">
        {navigation.map((navItem) => {
          const Icon = navItem.icon;
          const active = location.pathname === navItem.href;
          return <Link key={navItem.href} to={navItem.href} onClick={onClose} className={`flex items-center gap-3 rounded-lg px-4 py-3 ${active ? 'bg-primary-500 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}`}><Icon className="h-5 w-5" /><span className="font-medium">{navItem.name}</span></Link>;
        })}
      </nav>
    </aside>
  </>;
};
export default Sidebar;
