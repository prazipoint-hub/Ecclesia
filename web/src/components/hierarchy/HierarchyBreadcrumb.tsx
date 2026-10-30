import { ArrowRight } from 'lucide-react';
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
