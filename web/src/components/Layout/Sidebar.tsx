import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import { BarChart3, Boxes, Coins, FileCheck2, BookOpen, Building2, CalendarDays, FileText, Heart, HeartHandshake, Home, Layers3, Mail, Megaphone, Code2, Database, ScrollText, Search, Settings, Shield, SlidersHorizontal, UserCog, Upload, UserCircle, UserPlus, Users, UsersRound, X } from 'lucide-react';
import { useAuthStore } from '@stores/authStore';
import { useOrganizationStore } from '@stores/organizationStore';

interface SidebarProps { isOpen: boolean; onClose: () => void; }
const item = (name: string, href: string, icon: LucideIcon) => ({ name, href, icon });

export const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  const location = useLocation();
  const { t } = useTranslation();
  const { scope, selectedUnitId, getSbusForScope } = useOrganizationStore();
  const permissions = useAuthStore((state) => state.user?.permissions) ?? [];
  const scopePrefix = scope.toLowerCase();
  const navigation = [
    item(t('nav.myAccount'), '/my-account', UserCircle),
    item(t('nav.give'), '/give', Heart),
    item(t('nav.dashboard'), `/${scopePrefix}`, Home),
    ...(scope === 'CONFERENCE' ? [item(t('nav.districts'), '/conference/districts', Building2)] : []),
    ...(scope === 'DISTRICT' ? [item(t('nav.circuits'), '/district/circuits', Building2)] : []),
    item(t('nav.members'), '/members', Users),
    ...(permissions.includes('member:view') ? [item(t('nav.directory'), '/members/search', Search)] : []),
    ...(permissions.includes('member:import') ? [item(t('nav.importMembers'), '/members/import', Upload)] : []),
    ...(permissions.includes('visitor:view') ? [item(t('nav.visitors'), '/visitors', UserPlus)] : []),
    ...(permissions.includes('leadership:term:manage') ? [item(t('nav.leadership'), '/leadership', UsersRound)] : []),
    item(t('nav.pastoralCare'), '/pastoral', HeartHandshake),
    ...(permissions.includes('pastoral:dashboard:view') ? [item(t('nav.careDashboard'), '/pastoral/dashboard', HeartHandshake)] : []),
    ...(permissions.includes('pastoral:visit:view') ? [item(t('nav.visits'), '/pastoral/visits', HeartHandshake)] : []),
    ...(permissions.includes('pastoral:followup:view') ? [item(t('nav.followUps'), '/pastoral/followups', HeartHandshake)] : []),
    item(t('nav.prayer'), '/pastoral/prayer', HeartHandshake),
    item(t('nav.events'), '/events', CalendarDays),
    item(t('nav.upcomingEvents'), '/events/upcoming', CalendarDays),
    item(t('nav.eventCheckIn'), '/events/scan', CalendarDays),
    ...(permissions.includes('attendance:analytics:view') ? [item(t('nav.attendanceAnalytics'), '/events/analytics', BarChart3)] : []),
    ...(permissions.includes('absence:followup:manage') ? [item(t('nav.absenceFollowUp'), '/events/absences', CalendarDays)] : []),
    item(t('nav.committees'), `/${scopePrefix}/committees`, Layers3),
    ...getSbusForScope(selectedUnitId).map((sbu) => item(sbu.name, `/${scopePrefix}/sbus/${sbu.id}`, Building2)),
    item(t('nav.reports'), `/${scopePrefix}/reports`, FileText),
    item(t('nav.reportCatalog'), '/reports', FileText),
    item(t('nav.savedReports'), '/reports/saved', FileText),
    item(t('nav.churchDashboard'), '/dashboard/church', BarChart3),
    ...(permissions.includes('report:view:all_churches') ? [item(t('nav.hierarchyDashboard'), '/dashboard/hierarchy', BarChart3)] : []),
    item(t('nav.finance'), '/finance', BarChart3),
    ...(permissions.includes('finance:view') ? [item(t('nav.accounts'), '/finance/accounts', BookOpen), item(t('nav.journals'), '/finance/journals', FileText), item(t('nav.budgets'), '/finance/budgets', BarChart3), item(t('nav.financeReports'), '/finance/reports', FileText)] : []),
    ...(permissions.includes('notification:broadcast:create') ? [item(t('nav.broadcasts'), '/admin/broadcasts', Megaphone)] : []),
    ...(permissions.includes('notification:template:manage') ? [item(t('nav.templates'), '/admin/templates', Mail)] : []),
    ...(permissions.includes('admin:role:manage') ? [item(t('nav.roles'), '/admin/roles', Shield)] : []),
    ...(permissions.includes('admin:user:manage') ? [item(t('nav.users'), '/admin/users', UserCog)] : []),
    ...(permissions.includes('admin:settings:manage') ? [item(t('nav.systemSettings'), '/admin/settings', SlidersHorizontal)] : []),
    ...(permissions.includes('admin:audit:view') ? [item(t('nav.auditLog'), '/admin/audit-log', ScrollText)] : []),
    ...(permissions.includes('admin:retention:manage') ? [item(t('nav.dataRetention'), '/admin/retention', Database)] : []),
    ...(permissions.includes('admin:api:view') ? [item(t('nav.apiReference'), '/admin/api', Code2)] : []),
    ...(permissions.includes('campaign:manage') ? [item('Campaigns', '/campaigns', Coins)] : []),
    ...(permissions.includes('group:view') ? [item('Small groups', '/groups', UsersRound)] : []),
    ...(permissions.includes('asset:view') ? [item('Assets', '/assets', Boxes)] : []),
    ...(permissions.includes('document:view') ? [item('Documents', '/documents', FileCheck2)] : []),
    item(t('nav.settings'), '/settings', Settings),
  ];

  return <>
    {isOpen && <div className="fixed inset-0 z-30 bg-black bg-opacity-50 lg:hidden" onClick={onClose} />}
    <aside className={`fixed left-0 top-0 z-40 h-screen w-72 overflow-y-auto bg-gray-900 pt-20 text-white transition-transform duration-200 lg:translate-x-0 lg:pt-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex items-center justify-between px-4 py-4 lg:hidden"><h2 className="text-xl font-bold">{t('nav.tools', { scope })}</h2><button onClick={onClose} aria-label={t('common.close')}><X className="h-5 w-5" /></button></div>
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
