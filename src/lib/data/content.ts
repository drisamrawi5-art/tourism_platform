import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import type { Locale } from '@/i18n/config';
import { clampPage, mediaToImage, pickTranslation, type PublicImage } from '@/lib/data/common';

/**
 * Editorial content queries (journal, planning pages) — PUBLISHED only.
 * Each item carries verificationStatus so the UI can label editorial vs
 * project-provided material honestly.
 */

export type ContentCard = {
  id: string;
  slug: string;
  kind: string;
  title: string;
  summary: string | null;
  verificationStatus: string;
  publishedAt: Date | null;
  hero: PublicImage | null;
  featured: boolean;
};

export type ContentDetail = ContentCard & {
  body: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  noIndex: boolean;
};

type ContentWithTranslations = Prisma.ContentGetPayload<{ include: { translations: true } }>;

const JOURNAL_KINDS = ['STORY', 'EDITORIAL', 'TRAVEL_GUIDE'] as const;

function toCard(row: ContentWithTranslations, locale: Locale): Omit<ContentCard, 'hero'> {
  const t = pickTranslation(row.translations, locale);
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    title: t?.title ?? row.slug,
    summary: t?.summary ?? null,
    verificationStatus: row.verificationStatus,
    publishedAt: row.publishedAt,
    featured: row.featured,
  };
}

async function attachHeroes(
  cards: Omit<ContentCard, 'hero'>[],
  rows: { id: string; heroMediaId: string | null }[],
): Promise<ContentCard[]> {
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

export async function getJournal(
  locale: Locale,
  opts: { page?: number; perPage?: number; featured?: boolean } = {},
): Promise<{ items: ContentCard[]; total: number; page: number; perPage: number }> {
  const { skip, take, page, perPage } = clampPage(opts.page ?? 1, opts.perPage ?? 9);
  const where: Prisma.ContentWhereInput = {
    status: 'PUBLISHED',
    kind: { in: [...JOURNAL_KINDS] },
    ...(opts.featured ? { featured: true } : {}),
  };

  const [rows, total] = await Promise.all([
    db.content.findMany({
      where,
      include: { translations: true },
      orderBy: [{ featured: 'desc' }, { publishedAt: 'desc' }],
      skip,
      take,
    }),
    db.content.count({ where }),
  ]);

  const cards = await attachHeroes(
    rows.map((r) => toCard(r, locale)),
    rows,
  );
  return { items: cards, total, page, perPage };
}

export async function getContentBySlug(
  slug: string,
  locale: Locale,
): Promise<ContentDetail | null> {
  const row = await db.content.findFirst({
    where: { slug, status: 'PUBLISHED' },
    include: { translations: true },
  });
  if (!row) return null;

  const t = pickTranslation(row.translations, locale);
  const hero = row.heroMediaId
    ? mediaToImage(await db.media.findUnique({ where: { id: row.heroMediaId } }))
    : null;

  return {
    ...toCard(row, locale),
    hero,
    body: t?.body ?? null,
    seoTitle: t?.seoTitle ?? null,
    seoDescription: t?.seoDescription ?? null,
    noIndex: row.noIndex,
  };
}
