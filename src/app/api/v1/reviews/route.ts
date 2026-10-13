import { z } from 'zod';
import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';
import { getSetting } from '@/lib/settings';
import { db } from '@/lib/db';

const bodySchema = z.object({
  bookingId: z.string().min(1),
  bookableId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
});

const DAY_MS = 86_400_000;

/**
 * POST /api/v1/reviews — one review per customer, per bookable, per booking,
 * only for COMPLETED bookings inside the configured eligibility window.
 * Moderation status starts at PENDING.
 */
export const POST = createHandler({
  method: 'POST',
  auth: 'required',
  verifiedEmail: true,
  rateLimit: RATE_LIMITS.review,
  schema: { body: bodySchema },
  handler: async ({ body, user, ip }) => {
    const { bookingId, bookableId, rating, comment } = body;

    const booking = await db.booking.findFirst({
      where: { id: bookingId, customerId: user!.id },
      include: { items: true, business: true },
    });
    if (!booking) throw ApiError.notFound('Booking not found');

    if (booking.status !== 'COMPLETED') {
      throw ApiError.conflict('NOT_COMPLETED', 'Only completed bookings can be reviewed');
    }

    const windowDays = Number(await getSetting('review.eligibility.windowDays'));
    if (
      !booking.completedAt ||
      !(Date.now() - booking.completedAt.getTime() <= windowDays * DAY_MS)
    ) {
      throw ApiError.conflict('WINDOW_CLOSED', 'The review window for this booking has closed');
    }

    if (!booking.items.some((item) => item.bookableId === bookableId)) {
      throw ApiError.notFound('Bookable not found on this booking');
    }

    const existing = await db.review.findFirst({
      where: { bookingId, bookableId },
      select: { id: true },
    });
    if (existing) {
      throw ApiError.conflict(
        'ALREADY_REVIEWED',
        'You already reviewed this bookable for this booking',
      );
    }

    const review = await db.review.create({
      data: {
        bookingId,
        bookableId,
        businessId: booking.businessId,
        customerId: user!.id,
        rating,
        comment: comment ?? null,
        status: 'PENDING',
      },
    });

    void audit({
      actorId: user!.id,
      action: AUDIT_ACTIONS.reviewCreated,
      entityType: 'review',
      entityId: review.id,
      ip,
    });

    return { status: 201, data: { review } };
  },
});
