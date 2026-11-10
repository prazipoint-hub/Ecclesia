import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import { BarChart3, Boxes, Coins, FileCheck2, BookOpen, Building2, CalendarDays, ChevronRight, FileText, Heart, HeartHandshake, Home, Layers3, Mail, Megaphone, Code2, Database, ScrollText, Search, Settings, Shield, SlidersHorizontal, UserCog, Upload, UserCircle, UserPlus, Users, UsersRound, X} from 'lucide-react';
import { useAuthStore } from '@stores/authStore';
import { useOrganizationStore } from '@stores/organizationStore';

interface SidebarProps { isOpen: boolean; onClose: () => void; }
const item = (name: string, href: string, icon: LucideIcon) => ({ name, href, icon });

export const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  const location = useLocation();
  const { t } = useTranslation();
  const { scope, selectedUnitId, getSbusForScope } = useOrganizationStore();
  const permissions = useAuthStore((state) => state.user?.permissions) ?? [];
  const user = useAuthStore((state) => state.user);
  const scopePrefix = scope.toLowerCase();
  const overview = [
    item(t('nav.myAccount'), '/my-account', UserCircle),
    item(t('nav.give'), '/give', Heart),
    item('Where I hold a role', '/my-account/contexts', UserCircle),
    item(t('nav.dashboard'), `/${scopePrefix}`, Home),
  ];
  const people = [
    ...(scope === 'CONFERENCE' ? [item(t('nav.districts'), '/conference/districts', Building2)] : []),
    ...(scope === 'DISTRICT' ? [item(t('nav.circuits'), '/district/circuits', Building2)] : []),
    item(t('nav.members'), '/members', Users),
    ...(permissions.includes('member:view') ? [item(t('nav.directory'), '/members/search', Search)] : []),
    ...(permissions.includes('member:import') ? [item(t('nav.importMembers'), '/members/import', Upload)] : []),
    ...(permissions.includes('member:import') ? [item('Import (checked first)', '/members/import-jobs', Upload)] : []),
    ...(['leadership:appointment:view', 'leadership:appointment:manage', 'leadership:appointment:approve', 'leadership:import'].some((p) => permissions.includes(p)) ? [item('Leadership register', '/leadership/register', UsersRound)] : []),
    ...(['circuit:view', 'circuit:register', 'circuit:onboard'].some((p) => permissions.includes(p)) ? [item('Circuits and onboarding', '/circuits', Building2)] : []),
    ...(permissions.includes('visitor:view') ? [item(t('nav.visitors'), '/visitors', UserPlus)] : []),
    ...(permissions.includes('leadership:term:manage') ? [item(t('nav.leadership'), '/leadership', UsersRound)] : []),
  ];
  const ministry = [
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
  ];
  const insights = [
    item(t('nav.reports'), `/${scopePrefix}/reports`, FileText),
    item(t('nav.reportCatalog'), '/reports', FileText),
    item(t('nav.savedReports'), '/reports/saved', FileText),
    item(t('nav.churchDashboard'), '/dashboard/church', BarChart3),
    ...(permissions.includes('report:view:all_churches') ? [item(t('nav.hierarchyDashboard'), '/dashboard/hierarchy', BarChart3)] : []),
    item(t('nav.finance'), '/finance', BarChart3),
    ...(permissions.includes('finance:view') ? [item(t('nav.accounts'), '/finance/accounts', BookOpen), item(t('nav.journals'), '/finance/journals', FileText), item(t('nav.budgets'), '/finance/budgets', BarChart3), item(t('nav.financeReports'), '/finance/reports', FileText)] : []),
  ];
  const administration = [
    ...(permissions.includes('notification:broadcast:create') ? [item(t('nav.broadcasts'), '/admin/broadcasts', Megaphone)] : []),
    ...(permissions.includes('notification:template:manage') ? [item(t('nav.templates'), '/admin/templates', Mail)] : []),
    ...(permissions.includes('admin:role:manage') ? [item(t('nav.roles'), '/admin/roles', Shield)] : []),
    ...(permissions.includes('access:assign') || permissions.includes('access:assign:global') ? [item('Access by unit', '/admin/access', Shield)] : []),
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
  const groups = [
    { label: 'Workspace', items: overview },
    { label: 'People', items: people },
    { label: 'Ministry', items: ministry },
    { label: 'Finance & insights', items: insights },
    { label: 'Administration', items: administration },
  ].filter((group) => group.items.length > 0);

  return <>
    {isOpen && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} />}
    <aside className={`fixed left-0 top-0 z-50 flex h-screen w-[240px] flex-col bg-navy-900 text-white transition-transform duration-200 lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.08] px-4">
        <Link to={`/${scopePrefix}`} className="flex items-center gap-2.5" onClick={onClose}>
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-600 text-white text-sm font-medium">E</span>
          <span className="text-[15px] font-medium tracking-tight">Ecclesia</span>
        </Link>
        <button className="rounded p-1.5 text-gray-400 hover:bg-white/10 hover:text-white lg:hidden" onClick={onClose} aria-label={t('common.close')}><X className="h-4 w-4" /></button>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Primary navigation">
        {groups.map((group) => <div key={group.label}>
          <p className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-widest text-gray-500">{group.label}</p>
          <div className="space-y-px">{group.items.map((navItem) => {
            const Icon = navItem.icon;
            const active = location.pathname === navItem.href || (navItem.href !== `/${scopePrefix}` && location.pathname.startsWith(`${navItem.href}/`));
            return <Link key={`${group.label}-${navItem.href}-${navItem.name}`} to={navItem.href} onClick={onClose} aria-current={active ? 'page' : undefined} className={`group flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors ${active ? 'bg-white/[0.1] text-white font-medium' : 'text-gray-400 hover:bg-white/[0.06] hover:text-gray-200'}`}><Icon className={`h-4 w-4 shrink-0 ${active ? 'text-primary-400' : 'text-gray-500 group-hover:text-gray-400'}`} /><span className="min-w-0 flex-1 truncate">{navItem.name}</span>{active && <ChevronRight className="h-3.5 w-3.5 text-gray-500" />}</Link>;
          })}</div>
        </div>)}
      </nav>
      <div className="border-t border-white/[0.08] px-3 py-3">
        <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-700 text-xs font-medium text-white">
            {user?.firstName?.charAt(0) || 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-gray-200">{user?.email || 'User'}</p>
            <p className="text-[11px] text-gray-500">{scope.charAt(0) + scope.slice(1).toLowerCase()}</p>
          </div>
        </div>
      </div>
    </aside>
  </>;
};
export default Sidebar;
