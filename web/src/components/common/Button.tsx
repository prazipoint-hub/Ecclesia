import type { ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  isLoading?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 disabled:bg-gray-300',
  secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 disabled:bg-gray-100',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-300',
  ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 disabled:text-gray-400',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1 text-sm',
  md: 'px-4 py-2 text-base',
  lg: 'px-6 py-3 text-lg',
};

export const Button = ({
  variant = 'primary',
  size = 'md',
  children,
  isLoading = false,
  disabled = false,
  ...props
}: ButtonProps) => (
  <button
    className={`rounded-lg font-medium transition-colors disabled:cursor-not-allowed ${
      variantStyles[variant]
    } ${sizeStyles[size]}`}
    disabled={disabled || isLoading}
    {...props}
  >
    {isLoading ? <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : children}
  </button>
);
