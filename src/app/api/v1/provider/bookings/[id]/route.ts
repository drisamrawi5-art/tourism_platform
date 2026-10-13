import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { createHandler } from "@/lib/api/handler";
import { db } from "@/lib/db";

export const GET = createHandler({
  method: "GET",
  auth: "required",
  schema: { params: z.object({ id: z.string().min(1) }) },
  handler: async ({ params, user }) => {
    const booking = await db.booking.findFirst({
      where: { id: params.id, business: { ownerId: user!.id } },
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
        payments: {
          select: {
            id: true,
            status: true,
            amount: true,
            currency: true,
            mode: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
        reviews: true,
      },
    });
    if (!booking) throw ApiError.notFound();

    return { data: { booking } };
  },
});
