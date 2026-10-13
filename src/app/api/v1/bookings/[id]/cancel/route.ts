import { z } from 'zod';
import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { roleHasPermission } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import { cancelBooking } from '@/lib/booking/service';
import { bookingInclude } from '@/lib/booking/include';
import { toPublicBooking } from '@/lib/booking/serialize';

const paramsSchema = z.object({ id: z.string().min(1) });
const bodySchema = z.object({ reason: z.string().max(500).optional() }).default({});

/**
 * POST /api/v1/bookings/[id]/cancel — the customer who made it, or anyone
 * with `booking.cancel` (providers/admins). Everyone else gets 404.
 */
export const POST = createHandler({
  method: 'POST',
  auth: 'required',
  rateLimit: RATE_LIMITS.booking,
  schema: { params: paramsSchema, body: bodySchema },
  handler: async ({ params, body, user, ip }) => {
    const booking = await db.booking.findUnique({
      where: { id: params.id },
      select: { id: true, customerId: true },
    });
    if (!booking) throw ApiError.notFound('Booking not found');
    if (booking.customerId !== user!.id && !roleHasPermission(user!.role, 'booking.cancel')) {
      throw ApiError.notFound('Booking not found');
    }

    await cancelBooking({
      bookingId: booking.id,
      actorId: user!.id,
      reason: body?.reason,
      ip,
    });

    const updated = await db.booking.findUnique({
      where: { id: booking.id },
      include: bookingInclude,
    });
    if (!updated) throw ApiError.notFound('Booking not found');

    return { data: { booking: toPublicBooking(updated) } };
  },
});
