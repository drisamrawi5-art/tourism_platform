import { z } from 'zod';
import { createHandler, parsePagination } from '@/lib/api/handler';
import { db } from '@/lib/db';

const paramsSchema = z.object({ id: z.string().min(1) });
const querySchema = z.object({
  page: z.string().optional(),
  perPage: z.string().optional(),
});

/**
 * GET /api/v1/bookables/[id]/reviews — approved reviews only, with the
 * aggregate rating/count for the header. Custom envelope (pagination + meta).
 */
export const GET = createHandler({
  method: 'GET',
  schema: { params: paramsSchema, query: querySchema },
  handler: async ({ params, query }) => {
    const pagination = parsePagination(query, { perPage: 10, maxPerPage: 50 });
    const where = { bookableId: params.id, status: 'APPROVED' as const };

    const [items, aggregate] = await Promise.all([
      db.review.findMany({
        where,
        include: { customer: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      db.review.aggregate({
        where,
        _avg: { rating: true },
        _count: { _all: true },
      }),
    ]);

    const total = aggregate._count._all;
    return Response.json(
      {
        data: items,
        pagination: {
          page: pagination.page,
          perPage: pagination.perPage,
          total,
          totalPages: Math.max(1, Math.ceil(total / pagination.perPage)),
        },
        meta: { rating: aggregate._avg.rating, count: total },
      },
      { status: 200 },
    );
  },
});
