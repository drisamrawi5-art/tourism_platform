import { z } from "zod";
import { AUDIT_ACTIONS, audit } from "@/lib/audit";
import { ApiError } from "@/lib/api/errors";
import { createHandler } from "@/lib/api/handler";
import { db } from "@/lib/db";

export const POST = createHandler({
  method: "POST",
  auth: "required",
  permission: "business.submit",
  schema: {
    params: z.object({ id: z.string().min(1) }),
  },
  handler: async ({ params, user, ip }) => {
    if (!user) throw ApiError.unauthenticated();

    const business = await db.business.findFirst({
      where: { id: params.id, ownerId: user.id },
    });
    if (!business) throw ApiError.notFound();

    if (business.status !== "DRAFT" && business.status !== "REJECTED") {
      throw ApiError.conflict(
        "INVALID_STATUS",
        `Business cannot be submitted from status ${business.status}`,
      );
    }

    const updated = await db.business.update({
      where: { id: business.id },
      data: { status: "PENDING_REVIEW", submittedAt: new Date() },
    });

    void audit({
      actorId: user.id,
      action: AUDIT_ACTIONS.businessSubmitted,
      entityType: "business",
      entityId: business.id,
      ip,
      metadata: { previousStatus: business.status },
    });

    return { data: { business: updated } };
  },
});
