import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}

export const EmptyState = ({ icon: Icon, title, description, action }: EmptyStateProps) => (
  <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white/60 px-6 py-12 text-center">
    <span className="rounded-2xl bg-primary-50 p-4 text-primary-600 ring-1 ring-primary-100"><Icon className="h-7 w-7" /></span>
    <h3 className="mt-4 text-lg font-semibold text-gray-900">{title}</h3>
    <p className="mt-2 max-w-sm text-sm leading-relaxed text-gray-600">{description}</p>
    {action && <div className="mt-6">{action}</div>}
  </div>
);
