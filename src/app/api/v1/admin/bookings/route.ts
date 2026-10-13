import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { createHandler, paginated, parsePagination } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { createdAtRange, dateOnlyQuery, zBookingStatus, zPaymentStatus } from '../_shared/queries';

const querySchema = z.object({
  status: zBookingStatus.optional(),
  paymentStatus: zPaymentStatus.optional(),
  businessId: z.string().max(64).optional(),
  q: z.string().max(120).optional(),
  from: dateOnlyQuery.optional(),
  to: dateOnlyQuery.optional(),
  page: z.string().optional(),
  perPage: z.string().optional(),
});

/** GET /api/v1/admin/bookings — paginated booking list (all statuses). */
export const GET = createHandler({
  method: 'GET',
  auth: 'required',
  permission: 'booking.read',
  schema: { query: querySchema },
  handler: async ({ query, user, requestId }) => {
    if (!user) throw ApiError.unauthenticated();
    const pagination = parsePagination(query);

    const created = createdAtRange(query.from, query.to);
    const where: Prisma.BookingWhereInput = {
      ...(query.status !== undefined && { status: query.status }),
      ...(query.paymentStatus !== undefined && { paymentStatus: query.paymentStatus }),
      ...(query.businessId !== undefined && { businessId: query.businessId }),
      ...(query.q !== undefined && {
        OR: [
          { reference: { contains: query.q, mode: 'insensitive' } },
          { customerEmail: { contains: query.q, mode: 'insensitive' } },
        ],
      }),
      ...(created !== undefined && { createdAt: created }),
    };

    const [rows, total] = await Promise.all([
      db.booking.findMany({
        where,
        select: {
          id: true,
          reference: true,
          status: true,
          paymentStatus: true,
          paymentMode: true,
          startDate: true,
          endDate: true,
          guests: true,
          currency: true,
          subtotal: true,
          discount: true,
          total: true,
          depositAmount: true,
          amountPaid: true,
          amountRefunded: true,
          customerName: true,
          customerEmail: true,
          createdAt: true,
          confirmedAt: true,
          completedAt: true,
          cancelledAt: true,
          business: { select: { id: true, name: true, slug: true } },
          customer: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      db.booking.count({ where }),
    ]);

    const items = rows.map((row) => ({
      ...row,
      subtotal: row.subtotal.toString(),
      discount: row.discount.toString(),
      total: row.total.toString(),
      depositAmount: row.depositAmount === null ? null : row.depositAmount.toString(),
      amountPaid: row.amountPaid.toString(),
      amountRefunded: row.amountRefunded.toString(),
    }));

    return paginated(items, total, pagination, requestId);
  },
});
