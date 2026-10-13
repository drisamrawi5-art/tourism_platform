import { z } from "zod";
import { AUDIT_ACTIONS, audit } from "@/lib/audit";
import { ApiError } from "@/lib/api/errors";
import { createHandler } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { notify } from "@/lib/notifications";

export const POST = createHandler({
  method: "POST",
  auth: "required",
  permission: "booking.confirm",
  schema: { params: z.object({ id: z.string().min(1) }) },
  handler: async ({ params, user, ip }) => {
    const booking = await db.booking.findFirst({
      where: { id: params.id, business: { ownerId: user!.id } },
    });
    if (!booking) throw ApiError.notFound();

    if (booking.status !== "PENDING") {
      throw ApiError.conflict(
        "NOT_PENDING",
        "Only pending bookings can be confirmed",
      );
    }

    const updated = await db.booking.update({
      where: { id: booking.id },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });

    void audit({
      actorId: user!.id,
      action: AUDIT_ACTIONS.bookingConfirmed,
      entityType: "booking",
      entityId: booking.id,
      ip,
      metadata: { reference: booking.reference },
    });
    void notify(booking.customerId, "booking.confirmed", { ref: booking.reference }).catch(
      () => undefined,
    );

    return { data: { booking: updated } };
  },
});
