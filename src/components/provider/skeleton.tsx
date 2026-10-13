import { cn } from "@/lib/cn";

/**
 * Loading skeletons for the provider portal (uses the `.skeleton` shimmer
 * class from globals.css). Bars are decorative; the wrapper announces the
 * localized loading label to assistive tech.
 */

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("skeleton rounded-md", className)} />;
}

/** Vertical stack of placeholder rows (lists, tables). */
export function SkeletonList({
  label,
  rows = 4,
  className,
}: {
  label: string;
  rows?: number;
  className?: string;
}) {
  return (
    <div role="status" className={cn("space-y-3", className)}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}

/** Grid of placeholder tiles (stat rows). */
export function SkeletonStats({
  label,
  tiles = 4,
  className,
}: {
  label: string;
  tiles?: number;
  className?: string;
}) {
  return (
    <div role="status" className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: tiles }, (_, index) => (
        <Skeleton key={index} className="h-24 w-full" />
      ))}
    </div>
  );
}
