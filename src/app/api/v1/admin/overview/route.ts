import { Prisma } from '@prisma/client';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { daysAgo } from '../_shared/queries';

/** Rolling window for the overview metrics (spec: last 30 days). */
const OVERVIEW_WINDOW_DAYS = 30;

/** Only bookings that actually received money count towards revenue. */
const REVENUE_BOOKING_PAYMENT_STATUSES = ['PAID', 'PARTIALLY_PAID'] as const;

/** V1 platform currency (single-currency by design — see src/lib/settings.ts). */
const PLATFORM_CURRENCY = 'MAD';

/** Analytics event types surfaced on the overview. */
const OVERVIEW_EVENT_TYPES = ['booking_completed', 'payment_success', 'search'] as const;

/** GET /api/v1/admin/overview — real platform metrics for the admin dashboard. */
export const GET = createHandler({
  method: 'GET',
  auth: 'required',
  permission: 'analytics.read',
  handler: async ({ user }) => {
    if (!user) throw ApiError.unauthenticated();

    const since = daysAgo(OVERVIEW_WINDOW_DAYS);

    const [
      totalUsers,
      businessesByStatus,
      bookingsByStatus,
      recentRevenueBookings,
      pendingReviews,
      contentPendingReview,
      eventCounts,
    ] = await Promise.all([
      db.user.count(),
      db.business.groupBy({ by: ['status'], _count: { _all: true } }),
      db.booking.groupBy({
        by: ['status'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      db.booking.findMany({
        where: {
          paymentStatus: { in: [...REVENUE_BOOKING_PAYMENT_STATUSES] },
          createdAt: { gte: since },
        },
        select: { amountPaid: true, amountRefunded: true },
      }),
      db.review.count({ where: { status: 'PENDING' } }),
      db.content.count({ where: { status: 'PENDING_REVIEW' } }),
      db.analyticsEvent.groupBy({
        by: ['type'],
        where: { type: { in: [...OVERVIEW_EVENT_TYPES] }, createdAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);

    // Net revenue = amountPaid - amountRefunded (Decimal math, never floats).
    let netRevenue = new Prisma.Decimal(0);
    for (const row of recentRevenueBookings) {
      netRevenue = netRevenue.add(row.amountPaid).sub(row.amountRefunded);
    }

    const eventCountByType = new Map(eventCounts.map((row) => [row.type, row._count._all]));

    return {
      data: {
        totalUsers,
        businessesByStatus: businessesByStatus.map((row) => ({
          status: row.status,
          count: row._count._all,
        })),
        bookingsLast30DaysByStatus: bookingsByStatus.map((row) => ({
          status: row.status,
          count: row._count._all,
        })),
        revenueLast30Days: {
          amount: netRevenue.toString(),
          currency: PLATFORM_CURRENCY,
        },
        pendingReviews,
        contentPendingReview,
        analyticsLast30Days: {
          bookingCompleted: eventCountByType.get('booking_completed') ?? 0,
          paymentSuccess: eventCountByType.get('payment_success') ?? 0,
          search: eventCountByType.get('search') ?? 0,
        },
      },
    };
  },
});
