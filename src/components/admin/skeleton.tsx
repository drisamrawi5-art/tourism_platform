/**
 * `.skeleton` loading placeholders for the admin views (data-oriented
 * shimmer blocks — no spinners inside dense tables).
 */
export function SkeletonLine({ className }: { className?: string }) {
  return <div className={`skeleton h-4 rounded ${className ?? ""}`} />;
}

export function TableSkeleton({
  rows = 5,
  cols = 5,
  label,
}: {
  rows?: number;
  cols?: number;
  /** Localized sr-only status text (e.g. t(dict, "common.loading")). */
  label?: string;
}) {
  return (
    <div className="space-y-3" aria-busy="true">
      {label ? <span className="sr-only" role="status">{label}</span> : null}
      <div className="skeleton h-8 w-full rounded" aria-hidden="true" />
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex gap-3" aria-hidden="true">
          {Array.from({ length: cols }).map((__, col) => (
            <div key={col} className="skeleton h-5 flex-1 rounded" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ label }: { label?: string }) {
  return (
    <div className="space-y-4" aria-busy="true">
      {label ? <span className="sr-only" role="status">{label}</span> : null}
      <div className="skeleton h-6 w-1/3 rounded" aria-hidden="true" />
      <div className="skeleton h-4 w-2/3 rounded" aria-hidden="true" />
      <div className="skeleton h-4 w-1/2 rounded" aria-hidden="true" />
      <div className="skeleton h-32 w-full rounded" aria-hidden="true" />
    </div>
  );
}
