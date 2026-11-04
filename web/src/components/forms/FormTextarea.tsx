import { useId } from 'react';
import type { TextareaHTMLAttributes } from 'react';
import { inputClassName } from './FormField';

interface FormTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
}

export const FormTextarea = ({ label, error, id, className, rows = 4, ...props }: FormTextareaProps) => {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <div className={className}>
      <label htmlFor={fieldId} className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </label>
      <textarea
        id={fieldId}
        rows={rows}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        className={inputClassName(Boolean(error))}
        {...props}
      />
      {error && (
        <p id={`${fieldId}-error`} role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
};
