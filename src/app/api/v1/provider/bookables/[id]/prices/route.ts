import { z } from "zod";
import { AUDIT_ACTIONS, audit } from "@/lib/audit";
import { ApiError } from "@/lib/api/errors";
import { createHandler } from "@/lib/api/handler";
import { db } from "@/lib/db";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const paramsSchema = z.object({ id: z.string().min(1) });

export const GET = createHandler({
  method: "GET",
  auth: "required",
  schema: { params: paramsSchema },
  handler: async ({ params, user }) => {
    const bookable = await db.bookable.findFirst({
      where: { id: params.id, business: { ownerId: user!.id } },
      select: { id: true },
    });
    if (!bookable) throw ApiError.notFound();

    const prices = await db.price.findMany({
      where: { bookableId: bookable.id },
      orderBy: [{ unit: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
    });
    return { data: { prices } };
  },
});

export const PUT = createHandler({
  method: "PUT",
  auth: "required",
  permission: "pricing.manage",
  schema: {
    params: paramsSchema,
    body: z.object({
      prices: z
        .array(
          z.object({
            unit: z.enum(["NIGHT", "PERSON", "DAY", "SERVICE"]),
            amount: z.number().positive().max(999999),
            validFrom: z.string().regex(DATE_RE).nullable().optional(),
            validTo: z.string().regex(DATE_RE).nullable().optional(),
            priority: z.number().int().min(0).max(100).default(0),
            active: z.boolean().default(true),
          }),
        )
        .min(1)
        .max(20),
    }),
  },
  handler: async ({ params, body, user, ip }) => {
    const bookable = await db.bookable.findFirst({
      where: { id: params.id, business: { ownerId: user!.id } },
      select: { id: true },
    });
    if (!bookable) throw ApiError.notFound();

    // At most one base price (no date window) per pricing unit.
    const baseSeen = new Set<string>();
    for (const row of body.prices) {
      if (row.validFrom && row.validTo && row.validFrom > row.validTo) {
        throw ApiError.badRequest(
          "INVALID_DATE_RANGE",
          "validFrom must be on or before validTo",
        );
      }
      if (row.validFrom === null && row.validTo === null) {
        if (baseSeen.has(row.unit)) {
          throw ApiError.badRequest(
            "DUPLICATE_BASE_PRICE",
            `Only one base price (no date range) is allowed per unit (${row.unit})`,
          );
        }
        baseSeen.add(row.unit);
      }
    }

    const count = await db.$transaction(async (tx) => {
      await tx.price.deleteMany({ where: { bookableId: bookable.id } });
      const result = await tx.price.createMany({
        data: body.prices.map((row) => ({
          bookableId: bookable.id,
          unit: row.unit,
          amount: row.amount,
          currency: "MAD",
          validFrom: row.validFrom ? new Date(row.validFrom) : null,
          validTo: row.validTo ? new Date(row.validTo) : null,
          priority: row.priority,
          active: row.active,
        })),
      });
      return result.count;
    });

    void audit({
      actorId: user!.id,
      action: AUDIT_ACTIONS.priceChanged,
      entityType: "bookable",
      entityId: bookable.id,
      ip,
      metadata: { bookableId: bookable.id, count },
    });

    return { data: { count } };
  },
});
