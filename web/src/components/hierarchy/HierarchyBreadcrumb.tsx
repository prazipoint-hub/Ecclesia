import { ArrowRight, Building2, Landmark, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import type { OrganizationUnit } from '@/types/organization';

interface HierarchyBreadcrumbProps {
  units: OrganizationUnit[];
}

export const HierarchyBreadcrumb = ({ units }: HierarchyBreadcrumbProps) => {
  const items: ReactNode[] = [];

  units.forEach((unit, index) => {
    items.push(
      <span key={unit.id} className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <span className="rounded-full bg-primary-50 px-2 py-1 text-xs uppercase tracking-wide text-primary-700">
          {unit.type}
        </span>
        {unit.displayName}
        {index < units.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-gray-400" />}
      </span>,
    );
  });

  return <div className="flex flex-wrap items-center gap-2">{items}</div>;
};

export const ScopeBadge = ({ type }: { type: OrganizationUnit['type'] }) => {
  const config: Record<OrganizationUnit['type'], { label: string; className: string; icon: ReactNode }> = {
    CONFERENCE: {
      label: 'Conference',
      className: 'bg-violet-100 text-violet-700',
      icon: <Landmark className="h-3.5 w-3.5" />,
    },
    DISTRICT: {
      label: 'District',
      className: 'bg-emerald-100 text-emerald-700',
      icon: <Building2 className="h-3.5 w-3.5" />,
    },
    CIRCUIT: {
      label: 'Circuit',
      className: 'bg-sky-100 text-sky-700',
      icon: <ShieldCheck className="h-3.5 w-3.5" />,
    },
  };

  const { label, className, icon } = config[type];

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      {icon}
      {label}
    </span>
  );
};
