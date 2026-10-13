import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Metric tile for dashboards — value must already be formatted. */
export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'neutral' | 'positive' | 'warning' | 'danger';
  className?: string;
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-forest-700'
      : tone === 'warning'
        ? 'text-peach-700'
        : tone === 'danger'
          ? 'text-danger-600'
          : 'text-rocky-900';

  return (
    <div className={cn('rounded-card border border-rocky-200 bg-white p-4 sm:p-5', className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-rocky-500">{label}</p>
      <p className={cn('mt-1.5 text-2xl font-semibold tabular-nums', toneClass)}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-rocky-500">{hint}</p> : null}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Minimal table system for provider/admin dashboards (horizontal scroll on
 * small screens; all layout in logical flow so RTL mirrors automatically).
 * ------------------------------------------------------------------------- */

export function Table({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full text-sm', className)}>{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-rocky-200 bg-rocky-50 text-start">{children}</thead>;
}

export function TH({
  children,
  className,
  align = 'start',
}: {
  children?: ReactNode;
  className?: string;
  align?: 'start' | 'end' | 'center';
}) {
  return (
    <th
      scope="col"
      className={cn(
        'px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-rocky-500',
        align === 'end' && 'text-end',
        align === 'center' && 'text-center',
        align === 'start' && 'text-start',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function TR({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <tr className={cn('border-b border-rocky-100 last:border-b-0 hover:bg-rocky-50/70', className)}>
      {children}
    </tr>
  );
}

export function TD({
  children,
  className,
  align = 'start',
}: {
  children?: ReactNode;
  className?: string;
  align?: 'start' | 'end' | 'center';
}) {
  return (
    <td
      className={cn(
        'px-4 py-3 text-rocky-800 align-middle',
        align === 'end' && 'text-end',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  );
}
