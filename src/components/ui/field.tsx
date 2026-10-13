import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cloneElement, isValidElement, type ReactElement } from 'react';
import { cn } from '@/lib/cn';

/**
 * Form primitives with accessible labels, errors and hints.
 * Always render inside <Field> (label + error wiring) or provide aria-label.
 */

const CONTROL =
  'w-full rounded-lg border bg-white px-3 text-sm text-ink shadow-none ' +
  'placeholder:text-rocky-400 transition-colors ' +
  'border-rocky-300 hover:border-rocky-400 ' +
  'focus:border-water-600 focus:outline-none focus:ring-2 focus:ring-water-600/20 ' +
  'disabled:cursor-not-allowed disabled:bg-rocky-50 disabled:text-rocky-500 ' +
  'aria-[invalid=true]:border-danger-600 aria-[invalid=true]:focus:ring-danger-600/20';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cn(CONTROL, 'h-10', className)} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cn(CONTROL, 'min-h-24 py-2 leading-relaxed', className)} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cn(CONTROL, 'h-10 pe-8', className)}>
      {children}
    </select>
  );
}

export function Label({
  htmlFor,
  children,
  required,
  hint,
}: {
  htmlFor?: string;
  children: ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-3">
      <label htmlFor={htmlFor} className="text-sm font-medium text-rocky-800">
        {children}
        {required ? (
          <span className="text-danger-600" aria-hidden="true">
            {' *'}
          </span>
        ) : null}
      </label>
      {hint ? <span className="text-xs text-rocky-500">{hint}</span> : null}
    </div>
  );
}

/**
 * Labelled control wrapper:
 * <Field label="Email" error={errors.email}>…<Input/></Field>
 * The child receives id/aria-invalid/aria-describedby automatically.
 */
export function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  children,
  className,
}: {
  label?: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;
  const hintId = htmlFor ? `${htmlFor}-hint` : undefined;

  // Wire id/aria onto a single control child when provided.
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<InputHTMLAttributes<HTMLInputElement>>, {
        id: htmlFor,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? errorId : hint ? hintId : undefined,
      })
    : children;

  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <Label htmlFor={htmlFor} required={required} hint={hint}>
          {label}
        </Label>
      ) : null}
      {control}
      {hint && !error && hintId ? (
        <p id={hintId} className="text-xs text-rocky-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-danger-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Compact fieldset row used in dashboards/filters. */
export function FieldGroup({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-rocky-500">
        {label}
      </span>
      {children}
    </div>
  );
}
