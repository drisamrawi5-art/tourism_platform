import { z } from "zod";
import { createHandler } from "@/lib/api/handler";
import { db } from "@/lib/db";

export const DELETE = createHandler({
  method: "DELETE",
  auth: "required",
  schema: {
    params: z.object({ id: z.string().min(1), blockId: z.string().min(1) }),
  },
  handler: async ({ params, user }) => {
    await db.availabilityBlock.deleteMany({
      where: {
        id: params.blockId,
        bookableId: params.id,
        bookable: { business: { ownerId: user!.id } },
      },
    });
    return { data: { ok: true } };
  },
});
