import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { createHandler, paginated, parsePagination } from "@/lib/api/handler";
import { db } from "@/lib/db";

export const GET = createHandler({
  method: "GET",
  auth: "required",
  schema: {
    query: z.object({
      status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
      page: z.string().optional(),
      perPage: z.string().optional(),
    }),
  },
  handler: async ({ query, user, requestId }) => {
    const pagination = parsePagination(query);
    const where: Prisma.ReviewWhereInput = {
      bookable: { business: { ownerId: user!.id } },
      ...(query.status && { status: query.status }),
    };

    const [items, total] = await Promise.all([
      db.review.findMany({
        where,
        include: {
          customer: { select: { name: true } },
          bookable: {
            select: {
              slug: true,
              unit: { select: { name: true } },
              guideService: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take,
      }),
      db.review.count({ where }),
    ]);

    return paginated(items, total, pagination, requestId);
  },
});
