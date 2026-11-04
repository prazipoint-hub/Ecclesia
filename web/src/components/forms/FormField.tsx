import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const inputClassName = (hasError: boolean) =>
  `block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 ${
    hasError
      ? 'border-red-400 focus:ring-red-200'
      : 'border-gray-300 focus:border-primary-500 focus:ring-primary-200'
  }`;

export const FormField = ({ label, error, hint, id, className, ...props }: FormFieldProps) => {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <div className={className}>
      <label htmlFor={fieldId} className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        id={fieldId}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        className={inputClassName(Boolean(error))}
        {...props}
      />
      {hint && !error && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      {error && (
        <p id={`${fieldId}-error`} role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
};
