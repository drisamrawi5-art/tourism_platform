'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { isRtl, localeNames, locales, type Locale } from '@/i18n/config';
import { cn } from '@/lib/cn';

/**
 * Locale switcher: swaps the first path segment of the current URL
 * (locale-first routing) and keeps query params. The middleware remembers
 * the choice in a cookie.
 */
export function LanguageSwitcher({
  locale,
  label,
  align = 'end',
  className,
}: {
  locale: Locale;
  label: string;
  align?: 'start' | 'end';
  className?: string;
}) {
  const pathname = usePathname() ?? '/';
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const query = searchParams?.toString();
  const hrefFor = (next: Locale) => {
    const swapped = pathname.replace(/^\/[^/]+/, `/${next}`) || `/${next}`;
    return query ? `${swapped}?${query}` : swapped;
  };

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={label}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rocky-300 bg-white px-2.5 text-xs font-semibold uppercase tracking-wide text-rocky-700 transition-colors hover:border-forest-600 hover:text-forest-700"
      >
        <GlobeIcon />
        {locale}
      </button>

      {open ? (
        <ul
          role="listbox"
          aria-label={label}
          className={cn(
            'absolute top-full z-50 mt-1.5 min-w-36 overflow-hidden rounded-lg border border-rocky-200 bg-white py-1 shadow-lg',
            align === 'end' ? 'end-0' : 'start-0',
          )}
        >
          {locales.map((code) => (
            <li key={code}>
              <Link
                href={hrefFor(code)}
                lang={code}
                hrefLang={code}
                dir={isRtl(code) ? 'rtl' : 'ltr'}
                onClick={() => setOpen(false)}
                aria-current={code === locale ? 'true' : undefined}
                className={cn(
                  'flex items-center justify-between gap-3 px-3 py-2 text-sm transition-colors',
                  code === locale
                    ? 'bg-forest-50 font-semibold text-forest-800'
                    : 'text-rocky-700 hover:bg-rocky-50',
                )}
              >
                <span>{localeNames[code]}</span>
                <span className="text-xs uppercase text-rocky-400">{code}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function GlobeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.6 2.5 3.9 5.6 3.9 9S14.6 18.5 12 21c-2.6-2.5-3.9-5.6-3.9-9S9.4 5.5 12 3Z" />
    </svg>
  );
}
