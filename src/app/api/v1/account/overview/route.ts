import { createHandler } from '@/lib/api/handler';
import { db } from '@/lib/db';

/**
 * GET /api/v1/account/overview — real account counters for the customer
 * dashboard (no fabricated metrics; scoped strictly to the caller).
 */
export const GET = createHandler({
  method: 'GET',
  auth: 'required',
  handler: async ({ user }) => {
    const customerId = user!.id;
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const [bookings, wishlist, unread, activeBookings] = await Promise.all([
      db.booking.count({ where: { customerId } }),
      db.wishlistItem.count({ where: { userId: customerId } }),
      db.notification.count({ where: { userId: customerId, readAt: null } }),
      db.booking.findMany({
        where: {
          customerId,
          status: { in: ['PENDING', 'CONFIRMED'] },
          endDate: { gte: today },
        },
        select: {
          id: true,
          reference: true,
          startDate: true,
          endDate: true,
          status: true,
          paymentStatus: true,
        },
        orderBy: { startDate: 'asc' },
        take: 5,
      }),
    ]);

    return {
      data: {
        overview: {
          bookings,
          upcoming: activeBookings.length,
          wishlist,
          unreadNotifications: unread,
          nextBookings: activeBookings.map((b) => ({
            id: b.id,
            reference: b.reference,
            startDate: b.startDate.toISOString().slice(0, 10),
            endDate: b.endDate.toISOString().slice(0, 10),
            status: b.status,
            paymentStatus: b.paymentStatus,
          })),
        },
      },
    };
  },
});
