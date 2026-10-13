import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Button primitives — one class system shared by public site and dashboards.
 * Variants follow brand tokens: forest = primary, peach = accent CTA,
 * outline/ghost stay neutral (rocky). Uses logical-safe styling throughout.
 */

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-forest-600 text-white hover:bg-forest-700 active:bg-forest-800 shadow-sm',
  accent:
    'bg-peach-400 text-rocky-950 hover:bg-peach-500 active:bg-peach-600 shadow-sm font-semibold',
  secondary:
    'border border-rocky-300 bg-white text-rocky-800 hover:bg-rocky-100 active:bg-rocky-200',
  ghost: 'text-rocky-700 hover:bg-rocky-100 active:bg-rocky-200',
  danger: 'bg-danger-600 text-white hover:bg-danger-700 active:bg-danger-700 shadow-sm',
  link: 'text-water-700 underline underline-offset-2 hover:text-water-800 hover:decoration-2',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

const BASE =
  'inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap ' +
  'transition-colors disabled:pointer-events-none disabled:opacity-50 select-none';

/**
 * Remove a standalone utility token (e.g. `inline-flex`) without touching
 * prefixed variants like `md:inline-flex`.
 */
function dropToken(classNames: string, token: string): string {
  return classNames
    .split(/\s+/)
    .filter((part) => part !== token)
    .join(' ');
}

export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
): string {
  const merged = cn(BASE, VARIANTS[variant], SIZES[size], className);
  // Tailwind v4 emits `.inline-flex` after `.hidden` in the stylesheet, so the
  // component's base display would beat a caller's `hidden` class and the
  // button could never be hidden responsively (e.g. `hidden md:inline-flex`).
  // Drop the base display token when the caller hides the button; responsive
  // variants such as `md:inline-flex` still win inside their media query.
  const hides = (className ?? '').split(/\s+/).includes('hidden');
  return hides ? dropToken(merged, 'inline-flex') : merged;
}

type NativeButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: NativeButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses(variant, size, className)}
    >
      {loading && <Spinner className="size-4 shrink-0" />}
      {children}
    </button>
  );
}

type LinkButtonProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  external?: boolean;
};

export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  external,
  className,
  children,
  ...rest
}: LinkButtonProps) {
  const classes = buttonClasses(variant, size, className);
  if (external) {
    return (
      <a {...rest} href={href} className={classes} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return (
    <Link {...rest} href={href} className={classes}>
      {children}
    </Link>
  );
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <svg
      className={cn('size-5 animate-spin text-current', className)}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label={label ?? 'Loading'}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Centered loading block for async sections. */
export function LoadingBlock({
  text,
  className,
}: {
  text?: string;
  className?: string;
}): ReactNode {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-rocky-200 bg-white py-12 text-rocky-500',
        className,
      )}
    >
      <Spinner className="size-6 text-forest-600" />
      {text ? <p className="text-sm">{text}</p> : null}
    </div>
  );
}
