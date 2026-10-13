import type { Metadata } from 'next';
import type { Locale } from '@/i18n/config';
import { defaultLocale, locales, slogans } from '@/i18n/config';
import { getDictionary } from '@/i18n';
import { env } from '@/lib/env';

/**
 * SEO metadata construction (spec sections 14–16, 60).
 *
 * - One canonical URL per page; localized alternates for en/fr/ar + x-default
 * - Titles/descriptions come from localized CMS translation fields (or
 *   dictionary copy) — never invented marketing claims
 * - JSON-LD only from real, verified data (never fabricated ratings/hours)
 */

type BaseSEO = {
  locale: Locale;
  /** Path AFTER the locale segment, e.g. "/places/amda" */
  path: string;
  title?: string;
  description?: string;
  ogImage?: { url: string; alt: string } | null;
  noIndex?: boolean;
  type?: 'website' | 'article';
};

function absolute(path: string): string {
  return `${env.appUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

function localizedPaths(path: string, locale: Locale): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of locales) {
    const clean = path === '' || path === '/' ? '' : path;
    out[l] = absolute(`/${l}${clean}`);
  }
  out['x-default'] = absolute(`/${defaultLocale}${path === '' || path === '/' ? '' : path}`);
  void locale;
  return out;
}

/**
 * Build Next.js Metadata for a localized page. `path` is WITHOUT the locale
 * prefix (the [locale] segment handles it), e.g. "/places/amda".
 */
export function buildMetadata(opts: BaseSEO): Metadata {
  const d = getDictionary(opts.locale);
  const title = opts.title ? opts.title : d.brand.name;
  const description = opts.description ?? slogans[opts.locale];
  const canonical = absolute(`/${opts.locale}${opts.path === '/' ? '' : opts.path}`);
  const ogImage = opts.ogImage ? absolute(opts.ogImage.url) : null;

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: localizedPaths(opts.path, opts.locale),
    },
    robots: opts.noIndex ? { index: false, follow: false } : undefined,
    openGraph: {
      type: opts.type ?? 'website',
      url: canonical,
      title,
      description,
      siteName: d.brand.name,
      locale: opts.locale === 'ar' ? 'ar_MA' : opts.locale === 'fr' ? 'fr_MA' : 'en_MA',
      ...(ogImage ? { images: [{ url: ogImage, alt: opts.ogImage?.alt ?? d.brand.name }] } : {}),
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// JSON-LD structured data (only from real data passed in)
// ---------------------------------------------------------------------------

function websiteJsonLd(locale: Locale) {
  const d = getDictionary(locale);
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: d.brand.name,
    url: env.appUrl,
    description: d.brand.slogan,
    inLanguage: locale,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${env.appUrl}/${locale}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

function organizationJsonLd(locale: Locale) {
  const d = getDictionary(locale);
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: d.brand.name,
    url: env.appUrl,
    logo: `${env.appUrl}/icon.png`,
    description: d.footer.aboutBody,
  };
}

function breadcrumbJsonLd(locale: Locale, items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absolute(`/${locale}${item.path === '/' ? '' : item.path}`),
    })),
  };
}

/**
 * TouristDestination JSON-LD — built from the destination record with a
 * verified coordinate only; omits geo when coordinates are unknown.
 */
function destinationJsonLd(input: {
  locale: Locale;
  name: string;
  description?: string;
  lat?: number | null;
  lng?: number | null;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'TouristDestination',
    name: input.name,
    description: input.description,
    inLanguage: input.locale,
    ...(input.lat != null && input.lng != null
      ? { geo: { '@type': 'GeoCoordinates', latitude: input.lat, longitude: input.lng } }
      : {}),
  };
}

function placeJsonLd(input: {
  locale: Locale;
  name: string;
  description?: string;
  lat?: number | null;
  lng?: number | null;
  image?: string | null;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'TouristAttraction',
    name: input.name,
    description: input.description,
    ...(input.image ? { image: input.image } : {}),
    ...(input.lat != null && input.lng != null
      ? { geo: { '@type': 'GeoCoordinates', latitude: input.lat, longitude: input.lng } }
      : {}),
  };
}

/**
 * LodgingBusiness JSON-LD for an accommodation. NO aggregateRating or
 * openingHours unless genuine data exists (spec section 60).
 */
function lodgingJsonLd(input: {
  name: string;
  description?: string;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  image?: string | null;
  priceRange?: string | null;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'LodgingBusiness',
    name: input.name,
    description: input.description,
    ...(input.priceRange ? { priceRange: input.priceRange } : {}),
    ...(input.address
      ? { address: { '@type': 'PostalAddress', streetAddress: input.address } }
      : {}),
    ...(input.image ? { image: input.image } : {}),
    ...(input.lat != null && input.lng != null
      ? { geo: { '@type': 'GeoCoordinates', latitude: input.lat, longitude: input.lng } }
      : {}),
  };
}

/** Wrap JSON-LD for rendering inside <script type="application/ld+json">. */
export function JsonLd({ data }: { data: unknown }) {
  return {
    __html: JSON.stringify(data).replace(/</g, '\\u003c'),
  };
}

export const seoJsonLd = {
  website: websiteJsonLd,
  organization: organizationJsonLd,
  breadcrumb: breadcrumbJsonLd,
  destination: destinationJsonLd,
  place: placeJsonLd,
  lodging: lodgingJsonLd,
};
