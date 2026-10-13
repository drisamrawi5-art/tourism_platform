import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { createHandler } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { isLocale } from "@/i18n/config";

export const PATCH = createHandler({
  method: "PATCH",
  auth: "required",
  permission: "business.update",
  schema: {
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
      name: z.string().min(2).max(160).optional(),
      description: z.string().max(2000).nullable().optional(),
      phone: z.string().max(40).nullable().optional(),
      email: z.string().email().optional(),
      address: z.string().max(300).nullable().optional(),
      config: z
        .object({
          depositEnabled: z.boolean().optional(),
          depositPercent: z.number().min(1).max(100).optional(),
          freeCancellationHours: z.number().int().min(0).max(720).optional(),
          cancellationPolicyText: z.string().max(2000).optional(),
        })
        .optional(),
    }),
  },
  handler: async ({ params, body, user }) => {
    if (!user) throw ApiError.unauthenticated();

    const existing = await db.business.findFirst({
      where: { id: params.id, ownerId: user.id },
    });
    if (!existing) throw ApiError.notFound();

    let config: Prisma.InputJsonValue | undefined;
    if (body.config !== undefined) {
      const current =
        existing.config !== null &&
        typeof existing.config === "object" &&
        !Array.isArray(existing.config)
          ? (existing.config as Record<string, unknown>)
          : {};
      config = { ...current, ...body.config } as Prisma.InputJsonValue;
    }

    const data: Prisma.BusinessUpdateInput = {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.phone !== undefined && { phone: body.phone }),
      ...(body.email !== undefined && { email: body.email }),
      ...(body.address !== undefined && { address: body.address }),
      ...(config !== undefined && { config }),
    };

    const business = await db.$transaction(async (tx) => {
      const updated = await tx.business.update({ where: { id: existing.id }, data });

      if (body.description !== undefined || body.name !== undefined) {
        const locale = isLocale(user.locale) ? user.locale : "en";
        const translation = await tx.businessTranslation.findUnique({
          where: { businessId_locale: { businessId: existing.id, locale } },
        });
        if (translation) {
          await tx.businessTranslation.update({
            where: { id: translation.id },
            data: {
              ...(body.description !== undefined && { description: body.description }),
              ...(body.name !== undefined && { name: body.name }),
            },
          });
        } else {
          await tx.businessTranslation.create({
            data: {
              businessId: existing.id,
              locale,
              name: body.name ?? existing.name,
              description: body.description ?? null,
            },
          });
        }
      }

      return tx.business.findUnique({
        where: { id: existing.id },
        include: {
          translations: true,
          accommodation: true,
          guide: true,
          bookables: { select: { id: true, slug: true, category: true, status: true } },
        },
      });
    });

    return { data: { business } };
  },
});
