import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import { BarChart3, Boxes, Coins, FileCheck2, BookOpen, Building2, CalendarDays, ChevronRight, FileText, Heart, HeartHandshake, Home, Layers3, Mail, Megaphone, Code2, Database, ScrollText, Search, Settings, Shield, SlidersHorizontal, Sparkles, UserCog, Upload, UserCircle, UserPlus, Users, UsersRound, X } from 'lucide-react';
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
  const overview = [
    item(t('nav.myAccount'), '/my-account', UserCircle),
    item(t('nav.give'), '/give', Heart),
    item(t('nav.dashboard'), `/${scopePrefix}`, Home),
  ];
  const people = [
    ...(scope === 'CONFERENCE' ? [item(t('nav.districts'), '/conference/districts', Building2)] : []),
    ...(scope === 'DISTRICT' ? [item(t('nav.circuits'), '/district/circuits', Building2)] : []),
    item(t('nav.members'), '/members', Users),
    ...(permissions.includes('member:view') ? [item(t('nav.directory'), '/members/search', Search)] : []),
    ...(permissions.includes('member:import') ? [item(t('nav.importMembers'), '/members/import', Upload)] : []),
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
    {isOpen && <div className="fixed inset-0 z-40 bg-gray-950/55 backdrop-blur-sm lg:hidden" onClick={onClose} />}
    <aside className={`fixed left-0 top-0 z-50 flex h-screen w-72 flex-col border-r border-white/10 bg-[#24163a] text-white shadow-2xl transition-transform duration-200 lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-[69px] shrink-0 items-center justify-between border-b border-white/10 px-5">
        <Link to={`/${scopePrefix}`} className="flex items-center gap-3" onClick={onClose}>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 shadow-lg shadow-primary-950/30">
            <Sparkles className="h-5 w-5" />
          </span>
          <span><span className="block font-display text-lg font-semibold leading-tight">Ecclesia</span><span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-primary-200">Church ERP</span></span>
        </Link>
        <button className="rounded-lg p-2 text-primary-100 hover:bg-white/10 lg:hidden" onClick={onClose} aria-label={t('common.close')}><X className="h-5 w-5" /></button>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label="Primary navigation">
        {groups.map((group) => <div key={group.label}>
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-primary-200/70">{group.label}</p>
          <div className="space-y-1">{group.items.map((navItem) => {
            const Icon = navItem.icon;
            const active = location.pathname === navItem.href || (navItem.href !== `/${scopePrefix}` && location.pathname.startsWith(`${navItem.href}/`));
            return <Link key={`${group.label}-${navItem.href}-${navItem.name}`} to={navItem.href} onClick={onClose} aria-current={active ? 'page' : undefined} className={`group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${active ? 'bg-white text-primary-900 shadow-md' : 'text-primary-100/80 hover:bg-white/10 hover:text-white'}`}><Icon className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-primary-600' : 'text-primary-200/80 group-hover:text-white'}`} /><span className="min-w-0 flex-1 truncate font-semibold">{navItem.name}</span>{active && <ChevronRight className="h-4 w-4 text-primary-400" />}</Link>;
          })}</div>
        </div>)}
      </nav>
      <div className="m-3 rounded-xl border border-white/10 bg-white/[0.06] p-3">
        <p className="text-xs font-semibold text-white">{scope} workspace</p>
        <p className="mt-1 text-[11px] leading-relaxed text-primary-200/75">Secure church operations, people and stewardship.</p>
      </div>
    </aside>
  </>;
};
export default Sidebar;
