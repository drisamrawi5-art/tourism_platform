import Link from 'next/link';
import { getDictionary, type Dictionary } from '@/i18n';
import type { Locale } from '@/i18n/config';
import type { ContentCard } from '@/lib/data/content';
import { formatDate } from '@/lib/currency';
import { SmartImage } from '@/components/ui/image';

/**
 * Journal card shared by the journal index and the related-articles strip.
 *
 * All copy comes from the dictionary. The content `kind` is a data enum, so
 * it is only shown when an existing UI string covers it — unknown kinds render
 * without a kicker instead of leaking a raw enum into the interface.
 */

export function kindLabel(kind: string, dict: Dictionary): string | null {
  switch (kind) {
    case 'STORY':
      return dict.search.categories.content;
    case 'EDITORIAL':
      return dict.common.verification.EDITORIAL;
    case 'TRAVEL_GUIDE':
      return dict.search.categories.guide;
    default:
      return null;
  }
}

export function JournalCard({
  item,
  locale,
  href,
  priority = false,
}: {
  item: ContentCard;
  locale: Locale;
  href: string;
  priority?: boolean;
}) {
  const dict = getDictionary(locale);
  const kicker = kindLabel(item.kind, dict);

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-card border border-rocky-200 bg-white shadow-[0_1px_2px_rgba(16,26,36,0.05)]">
      <Link
        href={href}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-water-600/40"
        tabIndex={-1}
        aria-hidden="true"
      >
        <SmartImage image={item.hero} alt={item.title} ratio="aspect-[4/3]" priority={priority} />
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {kicker ? (
            <span className="font-semibold uppercase tracking-[0.14em] text-forest-700">
              {kicker}
            </span>
          ) : null}
          {item.publishedAt ? (
            <time dateTime={item.publishedAt.toISOString()} className="text-rocky-500">
              {formatDate(item.publishedAt, locale)}
            </time>
          ) : null}
        </div>
        <h3 className="mt-2 font-display text-lg font-semibold text-rocky-900">
          <Link href={href} className="transition-colors hover:text-forest-700">
            {item.title}
          </Link>
        </h3>
        {item.summary ? (
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-rocky-600">{item.summary}</p>
        ) : null}
        <Link
          href={href}
          className="mt-auto pt-4 text-sm font-medium text-water-700 transition-colors hover:text-water-800"
        >
          {dict.common.readMore}
        </Link>
      </div>
    </article>
  );
}
