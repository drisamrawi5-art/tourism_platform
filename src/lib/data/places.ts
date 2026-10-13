import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import type { Locale } from '@/i18n/config';
import { mediaToImage, pickTranslation, type PublicImage } from '@/lib/data/common';

/**
 * Place queries — PUBLISHED places of the published destination only.
 * Coordinates are returned as-is (null = unknown → UI shows the pending
 * placeholder; never fabricated).
 */

export type PlaceCard = {
  id: string;
  slug: string;
  name: string;
  typeLabel: string | null;
  summary: string | null;
  verificationStatus: string;
  featured: boolean;
  sortOrder: number;
  hero: PublicImage | null;
};

export type PlaceDetail = PlaceCard & {
  body: string | null;
  lat: number | null;
  lng: number | null;
};

type PlaceWithTranslations = Prisma.PlaceGetPayload<{ include: { translations: true } }>;

function toCard(row: PlaceWithTranslations, locale: Locale): Omit<PlaceCard, 'hero'> {
  const t = pickTranslation(row.translations, locale);
  return {
    id: row.id,
    slug: row.slug,
    name: t?.name ?? row.slug,
    typeLabel: t?.typeLabel ?? row.typeLabel,
    summary: t?.summary ?? null,
    verificationStatus: row.verificationStatus,
    featured: row.featured,
    sortOrder: row.sortOrder,
  };
}

async function attachHeroes(
  cards: Omit<PlaceCard, 'hero'>[],
  rows: PlaceWithTranslations[],
): Promise<PlaceCard[]> {
  const mediaIds = [
    ...new Set(rows.map((r) => r.heroMediaId).filter((x): x is string => Boolean(x))),
  ];
  const media = mediaIds.length ? await db.media.findMany({ where: { id: { in: mediaIds } } }) : [];
  const byId = new Map(media.map((m) => [m.id, m]));
  return cards.map((card, i) => ({
    ...card,
    hero: rows[i]?.heroMediaId ? mediaToImage(byId.get(rows[i]!.heroMediaId!)) : null,
  }));
}

export async function getPlaces(
  locale: Locale,
  opts: { featured?: boolean; take?: number } = {},
): Promise<PlaceCard[]> {
  const rows = await db.place.findMany({
    where: {
      status: 'PUBLISHED',
      destination: { status: 'PUBLISHED' },
      ...(opts.featured ? { featured: true } : {}),
    },
    include: { translations: true },
    orderBy: { sortOrder: 'asc' },
    ...(opts.take ? { take: opts.take } : {}),
  });
  return attachHeroes(
    rows.map((r) => toCard(r, locale)),
    rows,
  );
}

export async function getPlaceBySlug(slug: string, locale: Locale): Promise<PlaceDetail | null> {
  const row = await db.place.findFirst({
    where: { slug, status: 'PUBLISHED', destination: { status: 'PUBLISHED' } },
    include: { translations: true },
  });
  if (!row) return null;

  const hero = row.heroMediaId
    ? mediaToImage(await db.media.findUnique({ where: { id: row.heroMediaId } }))
    : null;
  const t = pickTranslation(row.translations, locale);

  return { ...toCard(row, locale), hero, body: t?.body ?? null, lat: row.lat, lng: row.lng };
}
