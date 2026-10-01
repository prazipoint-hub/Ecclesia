import type { LucideIcon, ReactNode } from 'react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}

export const EmptyState = ({ icon: Icon, title, description, action }: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 py-12">
    <Icon className="h-12 w-12 text-gray-400" />
    <h3 className="mt-4 text-lg font-semibold text-gray-900">{title}</h3>
    <p className="mt-2 max-w-sm text-center text-sm text-gray-600">{description}</p>
    {action && <div className="mt-6">{action}</div>}
  </div>
);
