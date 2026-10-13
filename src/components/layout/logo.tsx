import { cn } from '@/lib/cn';

/**
 * VI monogram + wordmark (brand system, spec section 9).
 * The monogram: forest circle, white "V", peach "I" — water-yellow accent
 * against forest green. Renders with currentColor-friendly sizing and needs
 * no image asset (CSP-safe inline SVG).
 */
export function Monogram({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={cn('size-9 shrink-0', className)}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <circle cx="20" cy="20" r="20" fill="var(--color-forest-700)" />
      <path
        d="M9.05 12 L16.5 27.4 L24 12"
        fill="none"
        stroke="#ffffff"
        strokeWidth="3.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="27.2" y="12" width="3.7" height="15.4" rx="1.85" fill="var(--color-peach-400)" />
    </svg>
  );
}

/** Monogram + "Visit Imedwan" wordmark (brand name is never translated). */
export function Logo({
  className,
  compact,
  onClick,
}: {
  className?: string;
  compact?: boolean;
  onClick?: () => void;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)} onClick={onClick}>
      <Monogram className="size-8" title="Visit Imedwan" />
      {!compact ? (
        <span className="flex flex-col leading-none">
          <span className="font-display text-lg font-semibold tracking-tight text-forest-800">
            Visit Imedwan
          </span>
        </span>
      ) : null}
    </span>
  );
}
