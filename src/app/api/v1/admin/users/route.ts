import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { createHandler, paginated, parsePagination } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { zRole, zUserStatus } from '../_shared/queries';

const querySchema = z.object({
  q: z.string().max(120).optional(),
  role: zRole.optional(),
  status: zUserStatus.optional(),
  page: z.string().optional(),
  perPage: z.string().optional(),
});

/** GET /api/v1/admin/users — paginated user list (never exposes passwordHash). */
export const GET = createHandler({
  method: 'GET',
  auth: 'required',
  permission: 'user.read',
  schema: { query: querySchema },
  handler: async ({ query, user, requestId }) => {
    if (!user) throw ApiError.unauthenticated();
    const pagination = parsePagination(query);

    const where: Prisma.UserWhereInput = {
      ...(query.q !== undefined && {
        OR: [
          { email: { contains: query.q, mode: 'insensitive' } },
          { name: { contains: query.q, mode: 'insensitive' } },
        ],
      }),
      ...(query.role !== undefined && { role: query.role }),
      ...(query.status !== undefined && { status: query.status }),
    };

    const [rows, total] = await Promise.all([
      db.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          emailVerifiedAt: true,
          createdAt: true,
          _count: { select: { businesses: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      db.user.count({ where }),
    ]);

    const items = rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      status: row.status,
      emailVerifiedAt: row.emailVerifiedAt,
      createdAt: row.createdAt,
      businessCount: row._count.businesses,
    }));

    return paginated(items, total, pagination, requestId);
  },
});
