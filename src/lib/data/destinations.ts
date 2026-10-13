import { db } from '@/lib/db';
import type { Locale } from '@/i18n/config';
import { pickTranslation } from '@/lib/data/common';

/**
 * Destination queries (published + project-provided verification only).
 */

export type DestinationDetail = {
  id: string;
  slug: string;
  name: string;
  slogan: string | null;
  summary: string | null;
  body: string | null;
  lat: number | null;
  lng: number | null;
  verificationStatus: string;
};

export async function getDestination(locale: Locale): Promise<DestinationDetail | null> {
  const destination = await db.destination.findFirst({
    where: { slug: 'imedwan', status: 'PUBLISHED' },
    include: { translations: true },
  });
  if (!destination) return null;

  const t = pickTranslation(destination.translations, locale);
  return {
    id: destination.id,
    slug: destination.slug,
    name: t?.name ?? destination.slug,
    slogan: t?.slogan ?? null,
    summary: t?.summary ?? null,
    body: t?.body ?? null,
    lat: destination.lat,
    lng: destination.lng,
    verificationStatus: destination.verificationStatus,
  };
}
