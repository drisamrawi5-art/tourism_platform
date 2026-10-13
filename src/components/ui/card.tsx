import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Surface card used across the public site and dashboards. */
export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={cn(
        'rounded-card border border-rocky-200 bg-white shadow-[0_1px_2px_rgba(16,26,36,0.05)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('p-5 sm:p-6', className)}>{children}</div>;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-rocky-200 px-5 py-4 sm:px-6',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-rocky-900">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-rocky-600">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Editorial section scaffolding (public site)
 * ------------------------------------------------------------------------- */

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8', className)}>{children}</div>
  );
}

export function Section({ className, children, ...rest }: React.HTMLAttributes<HTMLElement>) {
  return (
    <section {...rest} className={cn('py-10 sm:py-14', className)}>
      {children}
    </section>
  );
}

export function SectionHeader({
  kicker,
  title,
  description,
  action,
  align = 'start',
  className,
}: {
  kicker?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  align?: 'start' | 'center';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mb-6 flex flex-wrap items-end justify-between gap-4',
        align === 'center' && 'flex-col items-center text-center',
        className,
      )}
    >
      <div className={cn('max-w-2xl', align === 'center' && 'mx-auto')}>
        {kicker ? (
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-forest-700">
            {kicker}
          </p>
        ) : null}
        <h2 className="font-display text-2xl font-semibold text-rocky-900 sm:text-3xl">{title}</h2>
        {description ? (
          <p className="mt-2 text-base leading-relaxed text-rocky-600">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Page hero (public site). */
export function PageHero({
  kicker,
  title,
  description,
  children,
  className,
}: {
  kicker?: string;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'border-b border-rocky-200 bg-gradient-to-b from-forest-50 via-water-50/60 to-transparent',
        className,
      )}
    >
      <Container className="py-10 sm:py-14">
        {kicker ? (
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-forest-700">
            {kicker}
          </p>
        ) : null}
        <h1 className="font-display text-3xl font-semibold text-rocky-900 sm:text-4xl">{title}</h1>
        {description ? (
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-rocky-600 sm:text-lg">
            {description}
          </p>
        ) : null}
        {children ? <div className="mt-6">{children}</div> : null}
      </Container>
    </div>
  );
}
