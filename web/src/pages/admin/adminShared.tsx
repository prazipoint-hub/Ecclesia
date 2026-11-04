import type { ReactNode } from 'react';

export const AdminHeader = ({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) => (
  <div className="flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
      {subtitle && <p className="mt-2 text-gray-600">{subtitle}</p>}
    </div>
    {action}
  </div>
);

export const NoAccess = ({ permission }: { permission: string }) => (
  <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
    You need the <code>{permission}</code> permission to use this page.
  </p>
);
