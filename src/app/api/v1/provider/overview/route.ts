import { createHandler } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { isAdminRole } from "@/lib/auth/rbac";

/**
 * GET /api/v1/provider/overview — real provider metrics (spec section 24).
 * Every number is computed from the caller's own businesses (owner-scoped);
 * admins see metrics across all provider businesses.
 */
export const GET = createHandler({
  method: "GET",
  auth: "required",
  handler: async ({ user }) => {
    const actor = user!;
    const admin = isAdminRole(actor.role);
    const ownerFilter = admin ? {} : { ownerId: actor.id };

    const [byStatus, bookings, upcoming, pendingReviews] = await Promise.all([
      db.business.groupBy({ by: ["status"], where: ownerFilter, _count: { _all: true } }),
      db.booking.findMany({
        where: admin ? {} : { business: ownerFilter },
        select: {
          id: true,
          status: true,
          paymentStatus: true,
          amountPaid: true,
          amountRefunded: true,
          commissionAmount: true,
          endDate: true,
          createdAt: true,
        },
        take: 1000,
      }),
      db.booking.findMany({
        where: {
          ...(admin ? {} : { business: ownerFilter }),
          status: { in: ["PENDING", "CONFIRMED"] },
          endDate: { gte: new Date() },
        },
        select: {
          id: true,
          reference: true,
          startDate: true,
          endDate: true,
          status: true,
          paymentStatus: true,
        },
        orderBy: { startDate: "asc" },
        take: 5,
      }),
      db.review.count({
        where: {
          status: "PENDING",
          ...(admin ? {} : { business: ownerFilter }),
        },
      }),
    ]);

    let gross = 0;
    let refunded = 0;
    let commission = 0;
    const bookingsByStatus: Record<string, number> = {};
    for (const b of bookings) {
      gross += Number(b.amountPaid.toString());
      refunded += Number(b.amountRefunded.toString());
      commission += Number(b.commissionAmount.toString());
      bookingsByStatus[b.status] = (bookingsByStatus[b.status] ?? 0) + 1;
    }

    const businesses = byStatus.reduce<Record<string, number>>(
      (acc, row) => ({ ...acc, [row.status]: row._count._all }),
      {},
    );

    return {
      data: {
        overview: {
          businesses,
          bookingsByStatus,
          bookingsTotal: bookings.length,
          // Real collected amounts in MAD — gross, refunds and platform
          // commission are shown separately so nothing is misread as profit.
          revenue: {
            grossCollected: gross.toFixed(2),
            refunded: refunded.toFixed(2),
            commission: commission.toFixed(2),
            net: (gross - refunded - commission).toFixed(2),
            currency: "MAD",
          },
          upcomingBookings: upcoming.map((b) => ({
            id: b.id,
            reference: b.reference,
            startDate: b.startDate.toISOString().slice(0, 10),
            endDate: b.endDate.toISOString().slice(0, 10),
            status: b.status,
            paymentStatus: b.paymentStatus,
          })),
          pendingReviews,
        },
      },
    };
  },
});
