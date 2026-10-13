import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { createHandler, paginated, parsePagination } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { localeEntries, placeTranslationsInput, zPublicationStatus } from '../_shared/queries';

/** The single destination this V1 platform covers. */
const DEFAULT_DESTINATION_SLUG = 'imedwan';

const querySchema = z.object({
  status: zPublicationStatus.optional(),
  page: z.string().optional(),
  perPage: z.string().optional(),
});

const slugSchema = z
  .string()
  .regex(/^[a-z0-9-]+$/, 'Slug must be kebab-case')
  .min(2)
  .max(80);

const postBodySchema = z.object({
  slug: slugSchema,
  typeLabel: z.string().max(120).optional(),
  status: zPublicationStatus.optional(),
  featured: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  destinationSlug: z.string().min(1).max(80).optional(),
  translations: placeTranslationsInput,
});

/** GET /api/v1/admin/places — paginated places including drafts. */
export const GET = createHandler({
  method: 'GET',
  auth: 'required',
  permission: 'place.manage',
  schema: { query: querySchema },
  handler: async ({ query, user, requestId }) => {
    if (!user) throw ApiError.unauthenticated();
    const pagination = parsePagination(query);

    const where: Prisma.PlaceWhereInput = {
      ...(query.status !== undefined && { status: query.status }),
    };

    const [items, total] = await Promise.all([
      db.place.findMany({
        where,
        include: { translations: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      db.place.count({ where }),
    ]);

    return paginated(items, total, pagination, requestId);
  },
});

/** POST /api/v1/admin/places — create a place (en translation required). */
export const POST = createHandler({
  method: 'POST',
  auth: 'required',
  permission: 'place.manage',
  schema: { body: postBodySchema },
  handler: async ({ body, user }) => {
    if (!user) throw ApiError.unauthenticated();

    const existing = await db.place.findUnique({
      where: { slug: body.slug },
      select: { id: true },
    });
    if (existing) throw ApiError.conflict('SLUG_TAKEN', 'A place with this slug already exists');

    const destination = await db.destination.findUnique({
      where: { slug: body.destinationSlug ?? DEFAULT_DESTINATION_SLUG },
      select: { id: true },
    });
    if (!destination) throw ApiError.notFound('Destination not found');

    const place = await db.place.create({
      data: {
        slug: body.slug,
        typeLabel: body.typeLabel ?? null,
        status: body.status ?? 'DRAFT',
        featured: body.featured ?? false,
        sortOrder: body.sortOrder ?? 0,
        destinationId: destination.id,
        translations: {
          create: localeEntries(body.translations).map(({ locale, value }) => ({
            locale,
            name: value.name,
            typeLabel: value.typeLabel ?? null,
            summary: value.summary ?? null,
          })),
        },
      },
      include: { translations: true },
    });

    return { status: 201, data: { place } };
  },
});
