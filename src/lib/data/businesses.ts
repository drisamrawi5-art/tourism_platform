import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import type { Locale } from '@/i18n/config';
import { mediaToImage, pickTranslation, type PublicImage } from '@/lib/data/common';

/**
 * Accommodation & guide queries — published businesses with at least one
 * published bookable. Prices shown as "from" come from real active Price
 * rows; when no price exists the UI shows the price-pending state instead of
 * a number.
 */

export type PriceFrom = { amount: string; currency: string } | null;

export type AccommodationCard = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  type: string;
  address: string | null;
  capacity: number | null;
  verificationStatus: string;
  hero: PublicImage | null;
  priceFrom: PriceFrom;
  rating: number | null;
  reviewCount: number;
};

export type UnitCard = {
  id: string;
  name: string;
  description: string | null;
  capacity: number | null;
  bookableId: string | null;
  priceFrom: PriceFrom;
};

export type AccommodationDetail = AccommodationCard & {
  lat: number | null;
  lng: number | null;
  units: UnitCard[];
  bookableIds: string[];
};

export type GuideCard = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  languages: string[];
  areasCovered: string | null;
  verificationStatus: string;
  hero: PublicImage | null;
  priceFrom: PriceFrom;
  rating: number | null;
  reviewCount: number;
};

export type GuideServiceCard = {
  id: string;
  name: string;
  description: string | null;
  bookableId: string | null;
  priceFrom: PriceFrom;
  pricingUnit: string | null;
};

export type GuideDetail = GuideCard & {
  services: GuideServiceCard[];
  lat: number | null;
  lng: number | null;
};

// ---------------------------------------------------------------------------
// Single canonical include (keeps runtime rows and types in sync)
// ---------------------------------------------------------------------------

type BusinessIncludeFull = {
  translations: true;
  accommodation: {
    include: {
      units: { include: { bookable: { include: { prices: true; reviews: true } } } };
    };
  };
  guide: {
    include: {
      services: { include: { bookable: { include: { prices: true; reviews: true } } } };
    };
  };
  bookables: { include: { prices: true; reviews: true } };
};

const BUSINESS_INCLUDE: BusinessIncludeFull = {
  translations: true,
  accommodation: {
    include: {
      units: {
        include: {
          bookable: { include: { prices: true, reviews: true } },
        },
      },
    },
  },
  guide: {
    include: {
      services: {
        include: {
          bookable: { include: { prices: true, reviews: true } },
        },
      },
    },
  },
  bookables: { include: { prices: true, reviews: true } },
};

type BusinessWithRelations = Prisma.BusinessGetPayload<{ include: BusinessIncludeFull }>;

// ---------------------------------------------------------------------------
// Shared shaping helpers
// ---------------------------------------------------------------------------

function minPrice(
  prices: { amount: { toString(): string }; currency: string; active: boolean }[],
): PriceFrom {
  const active = prices.filter((p) => p.active);
  if (active.length === 0) return null;
  const min = active.reduce((a, b) =>
    Number(a.amount.toString()) <= Number(b.amount.toString()) ? a : b,
  );
  return { amount: min.amount.toString(), currency: min.currency };
}

function ratingOf(reviews: { rating: number; status: string }[]): {
  rating: number | null;
  reviewCount: number;
} {
  const approved = reviews.filter((r) => r.status === 'APPROVED');
  if (approved.length === 0) return { rating: null, reviewCount: 0 };
  const avg = approved.reduce((s, r) => s + r.rating, 0) / approved.length;
  return { rating: Math.round(avg * 10) / 10, reviewCount: approved.length };
}

async function attachHeroes<T extends { id: string }>(
  cards: T[],
  rows: { id: string; heroMediaId: string | null }[],
): Promise<(T & { hero: PublicImage | null })[]> {
  const mediaIds = [
    ...new Set(rows.map((r) => r.heroMediaId).filter((x): x is string => Boolean(x))),
  ];
  const media = mediaIds.length ? await db.media.findMany({ where: { id: { in: mediaIds } } }) : [];
  const byId = new Map(media.map((m) => [m.id, m]));
  const rowById = new Map(rows.map((r) => [r.id, r]));
  return cards.map((c) => {
    const hid = rowById.get(c.id)?.heroMediaId;
    return { ...c, hero: hid ? mediaToImage(byId.get(hid)) : null };
  });
}

// ---------------------------------------------------------------------------
// Accommodation
// ---------------------------------------------------------------------------

function toAccommodationCard(row: BusinessWithRelations, locale: Locale): AccommodationCard {
  const t = pickTranslation(row.translations, locale);
  const unitPrices = row.accommodation?.units.flatMap((u) => u.bookable?.prices ?? []) ?? [];
  const ownPrices = row.bookables.flatMap((b) => b.prices);
  const r = ratingOf(row.bookables.flatMap((b) => b.reviews));

  return {
    id: row.id,
    slug: row.slug,
    name: t?.name ?? row.name,
    description: t?.description ?? null,
    type: row.accommodation?.type ?? 'LOCAL_STAY',
    address: row.address,
    capacity: row.accommodation?.capacity ?? null,
    verificationStatus: row.verificationStatus,
    hero: null,
    priceFrom: minPrice([...unitPrices, ...ownPrices]),
    rating: r.rating,
    reviewCount: r.reviewCount,
  };
}

export async function getAccommodations(
  locale: Locale,
  opts: { capacity?: number; page?: number; perPage?: number } = {},
): Promise<{ items: AccommodationCard[]; total: number; page: number; perPage: number }> {
  const { skip, take, page, perPage } = clampPageOpts(opts.page, opts.perPage);
  const where: Prisma.BusinessWhereInput = {
    type: 'ACCOMMODATION',
    status: 'PUBLISHED',
    bookables: { some: { status: 'PUBLISHED' } },
    ...(opts.capacity ? { accommodation: { capacity: { gte: opts.capacity } } } : {}),
  };

  const [rows, total] = await Promise.all([
    db.business.findMany({
      where,
      include: BUSINESS_INCLUDE,
      orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
      skip,
      take,
    }),
    db.business.count({ where }),
  ]);

  const items = await attachHeroes(
    rows.map((r) => toAccommodationCard(r, locale)),
    rows,
  );
  return { items, total, page, perPage };
}

export async function getAccommodationBySlug(
  slug: string,
  locale: Locale,
): Promise<AccommodationDetail | null> {
  const row = await db.business.findFirst({
    where: {
      slug,
      type: 'ACCOMMODATION',
      status: 'PUBLISHED',
      bookables: { some: { status: 'PUBLISHED' } },
    },
    include: BUSINESS_INCLUDE,
  });
  if (!row) return null;

  const [heroCard] = await attachHeroes([toAccommodationCard(row, locale)], [row]);
  if (!heroCard) return null;

  const units: UnitCard[] =
    row.accommodation?.units.map((u) => ({
      id: u.id,
      name: u.name,
      description: u.description,
      capacity: u.capacity,
      bookableId: u.bookableId,
      priceFrom: u.bookable ? minPrice(u.bookable.prices) : null,
    })) ?? [];

  return {
    ...heroCard,
    lat: row.lat,
    lng: row.lng,
    units,
    bookableIds: row.bookables.map((b) => b.id),
  };
}

// ---------------------------------------------------------------------------
// Guides
// ---------------------------------------------------------------------------

function toGuideCard(row: BusinessWithRelations, locale: Locale): GuideCard {
  const t = pickTranslation(row.translations, locale);
  const prices = [
    ...(row.guide?.services.flatMap((s) => s.bookable?.prices ?? []) ?? []),
    ...row.bookables.flatMap((b) => b.prices),
  ];
  const r = ratingOf(row.bookables.flatMap((b) => b.reviews));
  return {
    id: row.id,
    slug: row.slug,
    name: t?.name ?? row.name,
    description: t?.description ?? null,
    languages: row.guide?.languages ?? [],
    areasCovered: row.guide?.areasCovered ?? null,
    verificationStatus: row.verificationStatus,
    hero: null,
    priceFrom: minPrice(prices),
    rating: r.rating,
    reviewCount: r.reviewCount,
  };
}

export async function getGuides(
  locale: Locale,
  opts: { language?: string; page?: number; perPage?: number } = {},
): Promise<{ items: GuideCard[]; total: number; page: number; perPage: number }> {
  const { skip, take, page, perPage } = clampPageOpts(opts.page, opts.perPage);
  const where: Prisma.BusinessWhereInput = {
    type: 'GUIDE',
    status: 'PUBLISHED',
    bookables: { some: { status: 'PUBLISHED' } },
    ...(opts.language ? { guide: { languages: { has: opts.language } } } : {}),
  };

  const [rows, total] = await Promise.all([
    db.business.findMany({
      where,
      include: BUSINESS_INCLUDE,
      orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
      skip,
      take,
    }),
    db.business.count({ where }),
  ]);

  const items = await attachHeroes(
    rows.map((r) => toGuideCard(r, locale)),
    rows,
  );
  return { items, total, page, perPage };
}

export async function getGuideBySlug(slug: string, locale: Locale): Promise<GuideDetail | null> {
  const row = await db.business.findFirst({
    where: {
      slug,
      type: 'GUIDE',
      status: 'PUBLISHED',
      bookables: { some: { status: 'PUBLISHED' } },
    },
    include: BUSINESS_INCLUDE,
  });
  if (!row) return null;

  const [card] = await attachHeroes([toGuideCard(row, locale)], [row]);
  if (!card) return null;

  const services: GuideServiceCard[] =
    row.guide?.services.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      bookableId: s.bookableId,
      priceFrom: s.bookable ? minPrice(s.bookable.prices) : null,
      pricingUnit: s.bookable?.prices.find((p) => p.active)?.unit ?? null,
    })) ?? [];

  return { ...card, services, lat: row.lat, lng: row.lng };
}

// ---------------------------------------------------------------------------

function clampPageOpts(page?: number, perPage?: number) {
  const p = Number.isFinite(page) && (page ?? 0) > 0 ? Math.floor(page!) : 1;
  const pp =
    Number.isFinite(perPage) && (perPage ?? 0) > 0 ? Math.min(Math.floor(perPage!), 100) : 12;
  return { skip: (p - 1) * pp, take: pp, page: p, perPage: pp };
}
