import type { ReactNode } from 'react';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 text-gray-800',
  success: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-sky-100 text-sky-800',
};

export const Badge = ({ variant = 'default', children, className = '' }: BadgeProps) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${variantStyles[variant]} ${className}`}>
    {children}
  </span>
);
