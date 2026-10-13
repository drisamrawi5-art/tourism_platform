import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { db } from '@/lib/db';
import { RATE_LIMITS } from '@/lib/rate-limit';

type PlaceHit = { slug: string; name: string; typeLabel: string | null };
type NamedHit = { slug: string; name: string };
type ContentHit = { slug: string; title: string };
type GroupResult<T> = { items: T[]; total: number };

async function searchPlaces(
  q: string,
  locale: string,
  take: number,
): Promise<GroupResult<PlaceHit>> {
  const where: Prisma.PlaceWhereInput = {
    status: 'PUBLISHED',
    translations: { some: { name: { contains: q, mode: 'insensitive' } } },
  };
  const [rows, total] = await Promise.all([
    db.place.findMany({
      where,
      select: {
        slug: true,
        typeLabel: true,
        translations: { select: { locale: true, name: true, typeLabel: true } },
      },
      orderBy: { sortOrder: 'asc' },
      take,
    }),
    db.place.count({ where }),
  ]);
  return {
    items: rows.map((row) => {
      const t = row.translations.find((tr) => tr.locale === locale) ?? row.translations[0];
      return {
        slug: row.slug,
        name: t?.name ?? row.slug,
        typeLabel: t?.typeLabel ?? row.typeLabel,
      };
    }),
    total,
  };
}

async function searchBusinesses(
  q: string,
  type: 'ACCOMMODATION' | 'GUIDE',
  locale: string,
  take: number,
): Promise<GroupResult<NamedHit>> {
  const where: Prisma.BusinessWhereInput = {
    type,
    status: 'PUBLISHED',
    bookables: { some: { status: 'PUBLISHED' } },
    translations: { some: { name: { contains: q, mode: 'insensitive' } } },
  };
  const [rows, total] = await Promise.all([
    db.business.findMany({
      where,
      select: {
        slug: true,
        name: true,
        translations: { select: { locale: true, name: true } },
      },
      orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }],
      take,
    }),
    db.business.count({ where }),
  ]);
  return {
    items: rows.map((row) => {
      const t = row.translations.find((tr) => tr.locale === locale) ?? row.translations[0];
      return { slug: row.slug, name: t?.name ?? row.name };
    }),
    total,
  };
}

async function searchContent(
  q: string,
  locale: string,
  take: number,
): Promise<GroupResult<ContentHit>> {
  const where: Prisma.ContentWhereInput = {
    status: 'PUBLISHED',
    translations: { some: { title: { contains: q, mode: 'insensitive' } } },
  };
  const [rows, total] = await Promise.all([
    db.content.findMany({
      where,
      select: {
        slug: true,
        translations: { select: { locale: true, title: true } },
      },
      orderBy: [{ featured: 'desc' }, { publishedAt: 'desc' }],
      take,
    }),
    db.content.count({ where }),
  ]);
  return {
    items: rows.map((row) => {
      const t = row.translations.find((tr) => tr.locale === locale) ?? row.translations[0];
      return { slug: row.slug, title: t?.title ?? row.slug };
    }),
    total,
  };
}

const querySchema = z.object({
  q: z.string().min(1).max(100),
  type: z.enum(['place', 'accommodation', 'guide', 'content', 'all']).optional(),
  locale: z.enum(['en', 'fr', 'ar']).optional(),
  perPage: z
    .string()
    .refine(
      (value) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 20,
      'perPage must be an integer between 1 and 20',
    )
    .optional(),
});

export const GET = createHandler({
  method: 'GET',
  auth: 'optional',
  rateLimit: RATE_LIMITS.search,
  schema: { query: querySchema },
  handler: async ({ query }) => {
    const q = query.q.trim();
    if (!q) throw ApiError.badRequest('INVALID_QUERY', 'Search query is empty');

    const type = query.type ?? 'all';
    const locale = query.locale ?? 'en';
    const take = query.perPage === undefined ? 10 : Number(query.perPage);
    const wantPlace = type === 'all' || type === 'place';
    const wantAccommodation = type === 'all' || type === 'accommodation';
    const wantGuide = type === 'all' || type === 'guide';
    const wantContent = type === 'all' || type === 'content';

    const empty = { items: [], total: 0 } as GroupResult<PlaceHit>;
    const [places, accommodations, guides, content] = await Promise.all([
      wantPlace ? searchPlaces(q, locale, take) : Promise.resolve(empty),
      wantAccommodation
        ? searchBusinesses(q, 'ACCOMMODATION', locale, take)
        : Promise.resolve({ items: [] as NamedHit[], total: 0 }),
      wantGuide
        ? searchBusinesses(q, 'GUIDE', locale, take)
        : Promise.resolve({ items: [] as NamedHit[], total: 0 }),
      wantContent
        ? searchContent(q, locale, take)
        : Promise.resolve({ items: [] as ContentHit[], total: 0 }),
    ]);

    return Response.json({
      data: {
        places: places.items,
        accommodations: accommodations.items,
        guides: guides.items,
        content: content.items,
      },
      pagination: {
        total: places.total + accommodations.total + guides.total + content.total,
      },
    });
  },
});
