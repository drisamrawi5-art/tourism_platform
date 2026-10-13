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

    const rules = await db.availabilityRule.findMany({
      where: { bookableId: bookable.id },
      orderBy: [{ startDate: "asc" }, { weekday: "asc" }],
    });
    return { data: { rules } };
  },
});

export const PUT = createHandler({
  method: "PUT",
  auth: "required",
  permission: "availability.manage",
  schema: {
    params: paramsSchema,
    body: z.object({
      rules: z
        .array(
          z.object({
            startDate: z.string().regex(DATE_RE),
            endDate: z.string().regex(DATE_RE).nullable().optional(),
            weekday: z.number().int().min(0).max(6).nullable().optional(),
            capacity: z.number().int().min(0).max(10000),
          }),
        )
        .max(100),
    }),
  },
  handler: async ({ params, body, user, ip }) => {
    const bookable = await db.bookable.findFirst({
      where: { id: params.id, business: { ownerId: user!.id } },
      select: { id: true },
    });
    if (!bookable) throw ApiError.notFound();

    for (const rule of body.rules) {
      if (rule.endDate && rule.endDate < rule.startDate) {
        throw ApiError.badRequest("INVALID_DATE_RANGE", "endDate must be on or after startDate");
      }
    }

    const count = await db.$transaction(async (tx) => {
      await tx.availabilityRule.deleteMany({ where: { bookableId: bookable.id } });
      const result = await tx.availabilityRule.createMany({
        data: body.rules.map((rule) => ({
          bookableId: bookable.id,
          startDate: new Date(rule.startDate),
          endDate: rule.endDate ? new Date(rule.endDate) : null,
          weekday: rule.weekday ?? null,
          capacity: rule.capacity,
        })),
      });
      return result.count;
    });

    void audit({
      actorId: user!.id,
      action: AUDIT_ACTIONS.availabilityChanged,
      entityType: "bookable",
      entityId: bookable.id,
      ip,
      metadata: { bookableId: bookable.id, kind: "rules", count },
    });

    return { data: { count } };
  },
});
