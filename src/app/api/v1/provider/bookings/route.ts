import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { createHandler, paginated, parsePagination } from "@/lib/api/handler";
import { db } from "@/lib/db";

export const GET = createHandler({
  method: "GET",
  auth: "required",
  schema: {
    query: z.object({
      status: z.enum(["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "REFUNDED"]).optional(),
      reference: z.string().max(30).optional(),
      page: z.string().optional(),
      perPage: z.string().optional(),
    }),
  },
  handler: async ({ query, user, requestId }) => {
    const pagination = parsePagination(query);
    const where: Prisma.BookingWhereInput = {
      business: { ownerId: user!.id },
      ...(query.status && { status: query.status }),
      ...(query.reference && {
        reference: { contains: query.reference, mode: "insensitive" },
      }),
    };

    const [items, total] = await Promise.all([
      db.booking.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, email: true, phone: true } },
          business: { select: { id: true, name: true } },
          items: {
            include: {
              bookable: {
                select: {
                  slug: true,
                  category: true,
                  unit: { select: { name: true } },
                  guideService: { select: { name: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take,
      }),
      db.booking.count({ where }),
    ]);

    return paginated(items, total, pagination, requestId);
  },
});
