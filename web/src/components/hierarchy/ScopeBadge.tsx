import type { ReactNode } from 'react';
import { Building2, Landmark, ShieldCheck } from 'lucide-react';
import type { OrganizationUnit } from '@/types/organization';

export const ScopeBadge = ({ type }: { type: OrganizationUnit['type'] }) => {
  const labels: Record<OrganizationUnit['type'], { label: string; className: string; icon: ReactNode }> = {
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

  const config = labels[type];

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${config.className}`}>
      {config.icon}
      {config.label}
    </span>
  );
};
