import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { createHandler, paginated, parsePagination } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { db } from '@/lib/db';

export const GET = createHandler({
  method: 'GET',
  auth: 'optional',
  schema: {
    query: z.object({
      placeId: z.string().max(60).optional(),
      businessId: z.string().max(60).optional(),
      contentId: z.string().max(60).optional(),
      albumId: z.string().max(60).optional(),
      page: z.string().max(10).optional(),
      perPage: z.string().max(10).optional(),
    }),
  },
  handler: async ({ query, requestId }) => {
    const subjects = [query.placeId, query.businessId, query.contentId, query.albumId].filter(
      (value): value is string => Boolean(value),
    );
    if (subjects.length !== 1) {
      throw ApiError.badRequest(
        'BAD_SUBJECT',
        'Provide exactly one of placeId, businessId, contentId or albumId',
      );
    }

    const where: Prisma.MediaWhereInput = {
      status: { in: ['PUBLISHED', 'APPROVED'] },
      ...(query.placeId ? { placeId: query.placeId } : {}),
      ...(query.businessId ? { businessId: query.businessId } : {}),
      ...(query.contentId ? { contentId: query.contentId } : {}),
      ...(query.albumId ? { albumId: query.albumId } : {}),
    };

    const pagination = parsePagination(
      { page: query.page ?? '', perPage: query.perPage ?? '' },
      { perPage: 24 },
    );

    const [rows, total] = await Promise.all([
      db.media.findMany({
        where,
        select: {
          id: true,
          storageKey: true,
          alt: true,
          caption: true,
          width: true,
          height: true,
          kind: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      db.media.count({ where }),
    ]);

    const items = rows.map((row) => ({
      id: row.id,
      url: `/api/v1/media/file/${row.storageKey}`,
      alt: row.alt,
      caption: row.caption,
      width: row.width,
      height: row.height,
      kind: row.kind,
      createdAt: row.createdAt,
    }));

    return paginated(items, total, pagination, requestId);
  },
});
