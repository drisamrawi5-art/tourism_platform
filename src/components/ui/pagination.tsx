import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * Pagination links (server component) — caller builds the href per page so it
 * works with both path routes and query-string filters.
 */
export function Pagination({
  page,
  totalPages,
  hrefFor,
  labels,
  className,
}: {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
  /** Localised labels (callers pass dictionary strings; English as fallback). */
  labels?: { previous?: string; next?: string; pagination?: string };
  className?: string;
}) {
  if (totalPages <= 1) return null;

  const previousLabel = labels?.previous ?? 'Previous page';
  const nextLabel = labels?.next ?? 'Next page';
  const paginationLabel = labels?.pagination ?? 'Pagination';

  const windowed = pageWindow(page, totalPages, 1);
  const prev = page > 1 ? hrefFor(page - 1) : null;
  const next = page < totalPages ? hrefFor(page + 1) : null;

  return (
    <nav
      aria-label={paginationLabel}
      className={cn('flex items-center justify-center gap-1', className)}
    >
      {prev ? (
        <PageLink href={prev} rel="prev">
          <span aria-hidden="true">{'←'}</span>
          <span className="sr-only">{previousLabel}</span>
        </PageLink>
      ) : (
        <PageDisabled>
          <span aria-hidden="true">{'←'}</span>
        </PageDisabled>
      )}

      {windowed.map((p, i) =>
        p === '…' ? (
          <span key={`gap-${i}`} className="px-2 text-sm text-rocky-400">
            …
          </span>
        ) : p === page ? (
          <span
            key={p}
            aria-current="page"
            className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg bg-forest-600 px-2 text-sm font-semibold text-white"
          >
            {p}
          </span>
        ) : (
          <PageLink key={p} href={hrefFor(p)}>
            {p}
          </PageLink>
        ),
      )}

      {next ? (
        <PageLink href={next} rel="next">
          <span className="sr-only">{nextLabel}</span>
          <span aria-hidden="true">{'→'}</span>
        </PageLink>
      ) : (
        <PageDisabled>
          <span aria-hidden="true">{'→'}</span>
        </PageDisabled>
      )}
    </nav>
  );
}

function PageLink({
  href,
  rel,
  children,
}: {
  href: string;
  rel?: 'prev' | 'next';
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      rel={rel}
      className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-rocky-300 bg-white px-2 text-sm font-medium text-rocky-700 transition-colors hover:border-forest-600 hover:text-forest-700"
    >
      {children}
    </Link>
  );
}

function PageDisabled({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-9 min-w-9 cursor-not-allowed items-center justify-center rounded-lg border border-rocky-200 bg-rocky-50 px-2 text-sm text-rocky-400">
      {children}
    </span>
  );
}

/** Numbers around the current page with ellipses. */
function pageWindow(page: number, totalPages: number, radius = 1): (number | '…')[] {
  const pages = new Set<number>([1, totalPages]);
  for (let p = page - radius; p <= page + radius; p++) {
    if (p >= 1 && p <= totalPages) pages.add(p);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  let prevNumber: number | null = null;
  for (const p of sorted) {
    if (prevNumber !== null && p - prevNumber > 1) out.push('…');
    out.push(p);
    prevNumber = p;
  }
  return out;
}
