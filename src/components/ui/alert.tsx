import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

const ALERT_TONES = {
  info: 'border-water-200 bg-water-50 text-water-900',
  success: 'border-forest-200 bg-forest-50 text-forest-900',
  warning: 'border-peach-200 bg-peach-50 text-peach-800',
  danger: 'border-danger-100 bg-danger-50 text-danger-700',
} as const;

export function Alert({
  tone = 'info',
  title,
  children,
  className,
  role,
}: {
  tone?: keyof typeof ALERT_TONES;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  role?: 'alert' | 'status';
}) {
  return (
    <div
      role={role ?? (tone === 'danger' ? 'alert' : 'status')}
      className={cn(
        'rounded-lg border px-4 py-3 text-sm leading-relaxed',
        ALERT_TONES[tone],
        className,
      )}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? 'mt-1' : undefined}>{children}</div> : null}
    </div>
  );
}

/** Empty / no-results state used on list pages and dashboards. */
export function EmptyState({
  title,
  description,
  action,
  icon,
  compact,
  className,
}: {
  title: string;
  description?: string;
  action?: { href: string; label: string };
  icon?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-card border border-dashed border-rocky-300 bg-white text-center',
        compact ? 'px-6 py-8' : 'px-6 py-14',
        className,
      )}
    >
      {icon ? (
        <div className="mb-3 text-rocky-400" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-rocky-800">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-rocky-600">{description}</p>
      ) : null}
      {action ? (
        <Link
          href={action.href}
          className="mt-4 inline-flex h-9 items-center rounded-lg bg-forest-600 px-4 text-sm font-medium text-white transition-colors hover:bg-forest-700"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
