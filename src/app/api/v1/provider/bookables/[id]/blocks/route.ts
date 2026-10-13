import { z } from "zod";
import { AUDIT_ACTIONS, audit } from "@/lib/audit";
import { ApiError } from "@/lib/api/errors";
import { createHandler } from "@/lib/api/handler";
import { db } from "@/lib/db";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const paramsSchema = z.object({ id: z.string().min(1) });

function isoDay(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

export const GET = createHandler({
  method: "GET",
  auth: "required",
  schema: {
    params: paramsSchema,
    query: z.object({
      from: z.string().regex(DATE_RE).optional(),
      to: z.string().regex(DATE_RE).optional(),
    }),
  },
  handler: async ({ params, query, user }) => {
    const bookable = await db.bookable.findFirst({
      where: { id: params.id, business: { ownerId: user!.id } },
      select: { id: true },
    });
    if (!bookable) throw ApiError.notFound();

    const from = query.from ?? isoDay(0);
    const to = query.to ?? isoDay(30);
    if (to < from) throw ApiError.badRequest("INVALID_RANGE", "`to` must be on or after `from`");

    const blocks = await db.availabilityBlock.findMany({
      where: {
        bookableId: bookable.id,
        startDate: { lte: new Date(to) },
        endDate: { gt: new Date(from) },
      },
      orderBy: { startDate: "asc" },
    });
    return { data: { blocks } };
  },
});

export const POST = createHandler({
  method: "POST",
  auth: "required",
  permission: "availability.manage",
  schema: {
    params: paramsSchema,
    body: z.object({
      startDate: z.string().regex(DATE_RE),
      endDate: z.string().regex(DATE_RE),
      state: z.enum(["AVAILABLE", "UNAVAILABLE", "BLOCKED", "BOOKED"]),
      capacityOverride: z.number().int().min(0).nullable().optional(),
      reason: z.string().max(200).nullable().optional(),
    }),
  },
  handler: async ({ params, body, user, ip }) => {
    const bookable = await db.bookable.findFirst({
      where: { id: params.id, business: { ownerId: user!.id } },
      select: { id: true },
    });
    if (!bookable) throw ApiError.notFound();

    if (body.endDate <= body.startDate) {
      throw ApiError.badRequest("INVALID_DATE_RANGE", "endDate must be after startDate");
    }

    const block = await db.availabilityBlock.create({
      data: {
        bookableId: bookable.id,
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        state: body.state,
        capacityOverride: body.capacityOverride ?? null,
        reason: body.reason ?? null,
      },
    });

    void audit({
      actorId: user!.id,
      action: AUDIT_ACTIONS.availabilityChanged,
      entityType: "bookable",
      entityId: bookable.id,
      ip,
      metadata: { bookableId: bookable.id, kind: "block", blockId: block.id },
    });

    return { status: 201, data: { block } };
  },
});
