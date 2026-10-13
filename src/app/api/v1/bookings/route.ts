import { z } from 'zod';
import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { createBooking } from '@/lib/booking/service';
import { bookingInclude } from '@/lib/booking/include';
import { toPublicBooking } from '@/lib/booking/serialize';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

const bodySchema = z.object({
  bookableId: z.string().min(1),
  startDate: dateOnly,
  endDate: dateOnly,
  guests: z.number().int().min(1).max(50),
  paymentMode: z.enum(['FULL', 'DEPOSIT']).optional(),
  customerName: z.string().max(120).optional(),
  customerPhone: z.string().max(40).optional(),
  customerNote: z.string().max(1000).optional(),
});

/** POST /api/v1/bookings — create a booking (server-side price + availability). */
export const POST = createHandler({
  method: 'POST',
  auth: 'required',
  verifiedEmail: true,
  rateLimit: RATE_LIMITS.booking,
  schema: { body: bodySchema },
  handler: async ({ body, req, user, ip, userAgent }) => {
    const header = req.headers.get('idempotency-key');
    const idempotencyKey = header === null ? null : z.string().min(8).max(100).parse(header);

    const result = await createBooking({
      customerId: user!.id,
      customerEmail: user!.email,
      request: {
        bookableId: body.bookableId,
        startDate: body.startDate,
        endDate: body.endDate,
        guests: body.guests,
        paymentMode: body.paymentMode,
        customerName: body.customerName,
        customerPhone: body.customerPhone,
        customerNote: body.customerNote,
      },
      idempotencyKey,
      meta: { ip, userAgent },
    });

    // Refetch with relations so the safe projection carries items + business.
    const full = await db.booking.findUnique({
      where: { id: result.booking.id },
      include: bookingInclude,
    });
    if (!full) throw ApiError.notFound('Booking not found');

    return {
      status: 201,
      data: { booking: toPublicBooking(full), idempotent: result.idempotent },
    };
  },
});
