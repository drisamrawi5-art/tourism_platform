import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { createHandler, paginated, parsePagination } from '@/lib/api/handler';
import { db } from '@/lib/db';

export const GET = createHandler({
  method: 'GET',
  auth: 'required',
  permission: 'business.read',
  schema: {
    query: z.object({
      status: z
        .enum(['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED', 'ARCHIVED'])
        .optional(),
      category: z.enum(['ACCOMMODATION', 'GUIDE']).optional(),
      q: z.string().max(120).optional(),
      page: z.string().optional(),
      perPage: z.string().optional(),
    }),
  },
  handler: async ({ query, user, requestId }) => {
    if (!user) throw ApiError.unauthenticated();
    const pagination = parsePagination(query);

    const where: Prisma.BookableWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.category && { category: query.category }),
      ...(query.q && {
        OR: [
          { slug: { contains: query.q, mode: 'insensitive' } },
          { unit: { name: { contains: query.q, mode: 'insensitive' } } },
          { guideService: { name: { contains: query.q, mode: 'insensitive' } } },
        ],
      }),
    };

    const [rows, total] = await Promise.all([
      db.bookable.findMany({
        where,
        include: {
          business: { select: { name: true, slug: true } },
          prices: true,
          unit: { select: { name: true } },
          guideService: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      db.bookable.count({ where }),
    ]);

    const items = rows.map((bookable) => {
      const activeAmounts = bookable.prices
        .filter((price) => price.active)
        .map((price) => Number(price.amount.toString()));
      const min = activeAmounts.length > 0 ? Math.min(...activeAmounts) : null;
      return { ...bookable, minActivePrice: min === null ? null : String(min) };
    });

    return paginated(items, total, pagination, requestId);
  },
});
