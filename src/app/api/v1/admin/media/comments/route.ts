import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { createHandler, paginated, parsePagination } from '@/lib/api/handler';
import { db } from '@/lib/db';

export const GET = createHandler({
  method: 'GET',
  auth: 'required',
  permission: 'media.moderate',
  schema: {
    query: z.object({
      status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING'),
      page: z.string().optional(),
      perPage: z.string().optional(),
    }),
  },
  handler: async ({ query, user, requestId }) => {
    if (!user) throw ApiError.unauthenticated();
    const pagination = parsePagination(query);
    const where: Prisma.MediaCommentWhereInput = { status: query.status };

    const [items, total] = await Promise.all([
      db.mediaComment.findMany({
        where,
        include: {
          media: { select: { id: true, storageKey: true, alt: true } },
          author: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      db.mediaComment.count({ where }),
    ]);

    return paginated(items, total, pagination, requestId);
  },
});
