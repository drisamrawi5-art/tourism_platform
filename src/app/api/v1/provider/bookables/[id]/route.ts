import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { createHandler } from "@/lib/api/handler";
import { db } from "@/lib/db";

const paramsSchema = z.object({ id: z.string().min(1) });

const DETAIL_INCLUDE = {
  business: { select: { id: true, name: true, slug: true, status: true } },
  unit: true,
  guideService: true,
  prices: true,
} as const;

export const PATCH = createHandler({
  method: "PATCH",
  auth: "required",
  permission: "service.manage",
  schema: {
    params: paramsSchema,
    body: z.object({
      name: z.string().min(2).max(160).optional(),
      description: z.string().max(1000).nullable().optional(),
      capacity: z.number().int().min(1).max(100).optional(),
      status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
    }),
  },
  handler: async ({ params, body, user }) => {
    const bookable = await db.bookable.findFirst({
      where: { id: params.id, business: { ownerId: user!.id } },
      include: DETAIL_INCLUDE,
    });
    if (!bookable) throw ApiError.notFound();

    if (body.status === "PUBLISHED" && bookable.business.status !== "PUBLISHED") {
      throw new ApiError(
        403,
        "BUSINESS_NOT_APPROVED",
        "Business must be approved before bookables can be published",
      );
    }

    await db.$transaction(async (tx) => {
      await tx.bookable.update({
        where: { id: bookable.id },
        data: {
          ...(body.capacity !== undefined && { capacity: body.capacity }),
          ...(body.status !== undefined && { status: body.status }),
        },
      });
      const subData = {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
      };
      if (Object.keys(subData).length > 0) {
        if (bookable.unit) {
          await tx.accommodationUnit.update({ where: { id: bookable.unit.id }, data: subData });
        }
        if (bookable.guideService) {
          await tx.guideService.update({ where: { id: bookable.guideService.id }, data: subData });
        }
      }
    });

    const updated = await db.bookable.findFirst({
      where: { id: bookable.id },
      include: DETAIL_INCLUDE,
    });
    if (!updated) throw ApiError.notFound();

    return { data: { bookable: updated } };
  },
});

export const DELETE = createHandler({
  method: "DELETE",
  auth: "required",
  permission: "service.manage",
  schema: { params: paramsSchema },
  handler: async ({ params, user }) => {
    const bookable = await db.bookable.findFirst({
      where: { id: params.id, business: { ownerId: user!.id } },
      select: { id: true },
    });
    if (!bookable) throw ApiError.notFound();

    const bookingItems = await db.bookingItem.count({ where: { bookableId: bookable.id } });
    if (bookingItems > 0) {
      throw ApiError.conflict(
        "HAS_BOOKINGS",
        "Bookable has bookings and can no longer be deleted",
      );
    }

    await db.$transaction(async (tx) => {
      // The unit/service row names the bookable — remove it before the FK from
      // Bookable is gone. Prices/rules/blocks cascade at the database level.
      await tx.accommodationUnit.deleteMany({ where: { bookableId: bookable.id } });
      await tx.guideService.deleteMany({ where: { bookableId: bookable.id } });
      await tx.bookable.delete({ where: { id: bookable.id } });
    });

    return new Response(null, { status: 204 });
  },
});
