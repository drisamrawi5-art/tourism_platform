import { z } from "zod";
import { markBookingCompleted } from "@/lib/booking/service";
import { ApiError } from "@/lib/api/errors";
import { createHandler } from "@/lib/api/handler";
import { db } from "@/lib/db";

export const POST = createHandler({
  method: "POST",
  auth: "required",
  permission: "booking.complete",
  schema: { params: z.object({ id: z.string().min(1) }) },
  handler: async ({ params, user }) => {
    const booking = await db.booking.findFirst({
      where: { id: params.id, business: { ownerId: user!.id } },
      select: { id: true },
    });
    if (!booking) throw ApiError.notFound();

    const updated = await markBookingCompleted({
      bookingId: booking.id,
      actorId: user!.id,
    });

    return { data: { booking: updated } };
  },
});
