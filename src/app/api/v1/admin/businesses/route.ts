import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { createHandler, paginated, parsePagination } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { zBusinessType, zPublicationStatus } from '../_shared/queries';

const querySchema = z.object({
  type: zBusinessType.optional(),
  status: zPublicationStatus.optional(),
  q: z.string().max(120).optional(),
  page: z.string().optional(),
  perPage: z.string().optional(),
});

/** GET /api/v1/admin/businesses — paginated business list (all statuses). */
export const GET = createHandler({
  method: 'GET',
  auth: 'required',
  permission: 'business.read',
  schema: { query: querySchema },
  handler: async ({ query, user, requestId }) => {
    if (!user) throw ApiError.unauthenticated();
    const pagination = parsePagination(query);

    const where: Prisma.BusinessWhereInput = {
      ...(query.type !== undefined && { type: query.type }),
      ...(query.status !== undefined && { status: query.status }),
      ...(query.q !== undefined && {
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { slug: { contains: query.q, mode: 'insensitive' } },
        ],
      }),
    };

    const [rows, total] = await Promise.all([
      db.business.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          type: true,
          status: true,
          verificationStatus: true,
          featured: true,
          submittedAt: true,
          approvedAt: true,
          createdAt: true,
          owner: { select: { id: true, email: true, name: true } },
          _count: { select: { bookables: true, bookings: true } },
        },
        orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      db.business.count({ where }),
    ]);

    const items = rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      type: row.type,
      status: row.status,
      verificationStatus: row.verificationStatus,
      featured: row.featured,
      submittedAt: row.submittedAt,
      approvedAt: row.approvedAt,
      createdAt: row.createdAt,
      owner: row.owner,
      bookableCount: row._count.bookables,
      bookingCount: row._count.bookings,
    }));

    return paginated(items, total, pagination, requestId);
  },
});
