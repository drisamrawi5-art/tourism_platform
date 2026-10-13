import { z } from 'zod';
import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { roleHasPermission } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import { bookingInclude } from '@/lib/booking/include';
import { toPublicBooking } from '@/lib/booking/serialize';

const paramsSchema = z.object({ id: z.string().min(1) });

/**
 * GET /api/v1/bookings/[id] — owner or anyone with `booking.read` (providers,
 * admins); everyone else gets 404 so booking ids cannot be probed.
 */
export const GET = createHandler({
  method: 'GET',
  auth: 'required',
  schema: { params: paramsSchema },
  handler: async ({ params, user }) => {
    const booking = await db.booking.findUnique({
      where: { id: params.id },
      include: {
        ...bookingInclude,
        reviews: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!booking) throw ApiError.notFound('Booking not found');
    if (booking.customerId !== user!.id && !roleHasPermission(user!.role, 'booking.read')) {
      throw ApiError.notFound('Booking not found');
    }

    return { data: { booking: toPublicBooking(booking), reviews: booking.reviews } };
  },
});
