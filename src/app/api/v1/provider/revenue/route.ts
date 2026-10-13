import type { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api/errors";
import { createHandler } from "@/lib/api/handler";
import { db } from "@/lib/db";

export const GET = createHandler({
  method: "GET",
  auth: "required",
  permission: "revenue.read",
  handler: async ({ user }) => {
    if (!user) throw ApiError.unauthenticated();

    const where: Prisma.BookingWhereInput = { business: { ownerId: user.id } };

    const [total, byStatusRaw, agg, last30] = await Promise.all([
      db.booking.count({ where }),
      db.booking.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
        _sum: { amountPaid: true, amountRefunded: true },
      }),
      db.booking.aggregate({
        where: { ...where, status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] } },
        _sum: { amountPaid: true, amountRefunded: true },
        _count: true,
      }),
      db.booking.count({
        where: { ...where, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
      }),
    ]);

    const gross = Number(agg._sum.amountPaid ?? 0);
    const refundedTotal = Number(agg._sum.amountRefunded ?? 0);

    return {
      data: {
        bookingsTotal: total,
        byStatus: byStatusRaw.map((row) => ({
          status: row.status,
          count: row._count._all,
          paid: String(row._sum.amountPaid ?? 0),
          refunded: String(row._sum.amountRefunded ?? 0),
        })),
        bookingsLast30: last30,
        grossPaid: String(gross),
        refunded: String(refundedTotal),
        net: String(gross - refundedTotal),
      },
    };
  },
});
