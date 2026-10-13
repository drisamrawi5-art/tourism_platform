import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { createHandler, paginated, parsePagination } from '@/lib/api/handler';
import { db } from '@/lib/db';
import {
  contentTranslationsInput,
  localeEntries,
  zContentKind,
  zPublicationStatus,
} from '../_shared/queries';

const querySchema = z.object({
  kind: zContentKind.optional(),
  status: zPublicationStatus.optional(),
  page: z.string().optional(),
  perPage: z.string().optional(),
});

const postBodySchema = z.object({
  kind: zContentKind,
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'Slug must be kebab-case')
    .min(2)
    .max(120),
  status: zPublicationStatus.optional(),
  featured: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  publishedAt: z.coerce.date().optional(),
  translations: contentTranslationsInput,
});

/** GET /api/v1/admin/content — paginated CMS content including drafts. */
export const GET = createHandler({
  method: 'GET',
  auth: 'required',
  permission: 'content.read.draft',
  schema: { query: querySchema },
  handler: async ({ query, user, requestId }) => {
    if (!user) throw ApiError.unauthenticated();
    const pagination = parsePagination(query);

    const where: Prisma.ContentWhereInput = {
      ...(query.kind !== undefined && { kind: query.kind }),
      ...(query.status !== undefined && { status: query.status }),
    };

    const [items, total] = await Promise.all([
      db.content.findMany({
        where,
        include: {
          translations: true,
          author: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      db.content.count({ where }),
    ]);

    return paginated(items, total, pagination, requestId);
  },
});

/** POST /api/v1/admin/content — create content (en translation required). */
export const POST = createHandler({
  method: 'POST',
  auth: 'required',
  permission: 'content.create',
  schema: { body: postBodySchema },
  handler: async ({ body, user }) => {
    if (!user) throw ApiError.unauthenticated();

    const existing = await db.content.findUnique({
      where: { slug: body.slug },
      select: { id: true },
    });
    if (existing) throw ApiError.conflict('SLUG_TAKEN', 'Content with this slug already exists');

    const content = await db.content.create({
      data: {
        kind: body.kind,
        slug: body.slug,
        status: body.status ?? 'DRAFT',
        featured: body.featured ?? false,
        sortOrder: body.sortOrder ?? 0,
        publishedAt: body.publishedAt ?? null,
        authorId: user.id,
        translations: {
          create: localeEntries(body.translations).map(({ locale, value }) => ({
            locale,
            title: value.title,
            summary: value.summary ?? null,
            body: value.body ?? null,
          })),
        },
      },
      include: {
        translations: true,
        author: { select: { id: true, name: true, email: true } },
      },
    });

    return { status: 201, data: { content } };
  },
});
