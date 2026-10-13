import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { createHandler, paginated, parsePagination } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { zPaymentStatus } from '../_shared/queries';

const querySchema = z.object({
  status: zPaymentStatus.optional(),
  provider: z.string().max(60).optional(),
  bookingId: z.string().max(64).optional(),
  page: z.string().optional(),
  perPage: z.string().optional(),
});

/** GET /api/v1/admin/payments — paginated payment attempts (all statuses). */
export const GET = createHandler({
  method: 'GET',
  auth: 'required',
  permission: 'payment.read',
  schema: { query: querySchema },
  handler: async ({ query, user, requestId }) => {
    if (!user) throw ApiError.unauthenticated();
    const pagination = parsePagination(query);

    const where: Prisma.PaymentWhereInput = {
      ...(query.status !== undefined && { status: query.status }),
      ...(query.provider !== undefined && { provider: query.provider }),
      ...(query.bookingId !== undefined && { bookingId: query.bookingId }),
    };

    const [rows, total] = await Promise.all([
      db.payment.findMany({
        where,
        select: {
          id: true,
          bookingId: true,
          provider: true,
          mode: true,
          status: true,
          amount: true,
          currency: true,
          failureReason: true,
          paidAt: true,
          failedAt: true,
          createdAt: true,
          booking: { select: { id: true, reference: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      db.payment.count({ where }),
    ]);

    const items = rows.map((row) => ({
      ...row,
      amount: row.amount.toString(),
    }));

    return paginated(items, total, pagination, requestId);
  },
});
