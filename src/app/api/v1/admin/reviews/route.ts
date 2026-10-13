import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { createHandler, paginated, parsePagination } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { zReviewStatus } from '../_shared/queries';

const querySchema = z.object({
  status: zReviewStatus.optional(),
  bookableId: z.string().max(64).optional(),
  businessId: z.string().max(64).optional(),
  rating: z.string().optional(),
  page: z.string().optional(),
  perPage: z.string().optional(),
});

/** GET /api/v1/admin/reviews — moderation queue (all statuses). */
export const GET = createHandler({
  method: 'GET',
  auth: 'required',
  permission: 'review.moderate',
  schema: { query: querySchema },
  handler: async ({ query, user, requestId }) => {
    if (!user) throw ApiError.unauthenticated();
    const pagination = parsePagination(query, { perPage: 25 });

    let rating: number | undefined;
    if (query.rating !== undefined) {
      rating = Number.parseInt(query.rating, 10);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        throw ApiError.badRequest('INVALID_RATING', 'rating must be an integer from 1 to 5');
      }
    }

    const where: Prisma.ReviewWhereInput = {
      ...(query.status !== undefined && { status: query.status }),
      ...(query.bookableId !== undefined && { bookableId: query.bookableId }),
      ...(query.businessId !== undefined && { businessId: query.businessId }),
      ...(rating !== undefined && { rating }),
    };

    const [rows, total] = await Promise.all([
      db.review.findMany({
        where,
        select: {
          id: true,
          rating: true,
          comment: true,
          status: true,
          moderatedAt: true,
          createdAt: true,
          customer: { select: { id: true, name: true, email: true } },
          booking: { select: { id: true, reference: true } },
          bookable: { select: { id: true, slug: true, category: true } },
          business: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      db.review.count({ where }),
    ]);

    return paginated(rows, total, pagination, requestId);
  },
});
