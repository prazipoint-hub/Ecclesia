import type { ReactNode } from 'react';

export const AdminHeader = ({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) => (
  <div className="flex flex-wrap items-end justify-between gap-4">
    <div className="min-w-0">
      <p className="page-eyebrow">Ecclesia workspace</p>
      <h1 className="mt-2 break-words text-3xl font-semibold text-gray-950 sm:text-4xl">{title}</h1>
      {subtitle && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-600 sm:text-base">{subtitle}</p>}
    </div>
    {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
  </div>
);

export const NoAccess = ({ permission }: { permission: string }) => (
  <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 shadow-sm">
    You need the <code>{permission}</code> permission to use this page.
  </p>
);
