import { z } from 'zod';
import { markBookingCompleted } from '@/lib/booking/service';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { db } from '@/lib/db';

/**
 * POST /api/v1/admin/bookings/[id]/complete — admin completion (same rules as
 * the provider route: only CONFIRMED or PENDING bookings complete; the
 * service records the audit entry and asks the customer for a review).
 */
export const POST = createHandler({
  method: 'POST',
  auth: 'required',
  permission: 'booking.complete',
  schema: { params: z.object({ id: z.string().min(1) }) },
  handler: async ({ params, user }) => {
    const booking = await db.booking.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!booking) throw ApiError.notFound();

    const updated = await markBookingCompleted({
      bookingId: booking.id,
      actorId: user!.id,
    });

    return { data: { booking: updated } };
  },
});
