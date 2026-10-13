import { z } from 'zod';
import { createHandler, parsePagination, paginated } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { bookingInclude } from '@/lib/booking/include';
import { toPublicBooking } from '@/lib/booking/serialize';

const querySchema = z.object({
  page: z.string().optional(),
  perPage: z.string().optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'REFUNDED']).optional(),
});

/** GET /api/v1/bookings/mine — the caller's own bookings (IDOR-safe scope). */
export const GET = createHandler({
  method: 'GET',
  auth: 'required',
  schema: { query: querySchema },
  handler: async ({ query, user, requestId }) => {
    const pagination = parsePagination(query, { perPage: 20 });
    const where = {
      customerId: user!.id,
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      db.booking.findMany({
        where,
        include: bookingInclude,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      db.booking.count({ where }),
    ]);

    return paginated(
      items.map((booking) => toPublicBooking(booking)),
      total,
      pagination,
      requestId,
    );
  },
});
