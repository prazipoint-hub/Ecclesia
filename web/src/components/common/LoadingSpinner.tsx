interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
}

const sizeMap = {
  sm: 'h-6 w-6',
  md: 'h-10 w-10',
  lg: 'h-16 w-16',
};

export const LoadingSpinner = ({ size = 'md', message }: LoadingSpinnerProps) => (
  <div className="flex flex-col items-center justify-center gap-3">
    <div className={`${sizeMap[size]} animate-spin rounded-full border-4 border-gray-200 border-t-primary-500`} />
    {message && <p className="text-sm text-gray-500">{message}</p>}
  </div>
);
