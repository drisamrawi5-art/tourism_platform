import type { Media } from '@prisma/client';
import type { Locale } from '@/i18n/config';

/**
 * Shared helpers for public read queries (spec sections 17–21).
 * Rules enforced by these helpers:
 * - only PUBLISHED rows are ever returned to visitors
 * - locale fallback: requested → en → any available (never empty strings)
 * - media URLs resolve through the storage abstraction
 */

export function pickTranslation<T extends { locale: string }>(
  translations: T[],
  locale: Locale,
): T | undefined {
  return (
    translations.find((t) => t.locale === locale) ??
    translations.find((t) => t.locale === 'en') ??
    translations[0]
  );
}

export type PublicImage = {
  url: string;
  alt: string;
  width?: number | null;
  height?: number | null;
};

export function mediaToImage(media: Media | null | undefined): PublicImage | null {
  if (!media || media.kind !== 'IMAGE' || media.status === 'ARCHIVED') return null;
  return {
    url: `/api/v1/media/file/${media.storageKey}`,
    alt: media.alt,
    width: media.width,
    height: media.height,
  };
}

/** Safe pagination bounds for server components. */
export function clampPage(
  page: number,
  perPage: number,
  max = 100,
): { skip: number; take: number; page: number; perPage: number } {
  const p = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const pp = Number.isFinite(perPage) && perPage > 0 ? Math.min(Math.floor(perPage), max) : 12;
  return { page: p, perPage: pp, skip: (p - 1) * pp, take: pp };
}
