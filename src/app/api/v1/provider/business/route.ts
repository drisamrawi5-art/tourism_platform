import { z } from "zod";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/api/errors";
import { createHandler } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { isLocale } from "@/i18n/config";

const BUSINESS_INCLUDE = {
  translations: true,
  accommodation: true,
  guide: true,
  bookables: { select: { id: true, slug: true, category: true, status: true } },
} as const;

function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "business";
}

async function uniqueBusinessSlug(name: string): Promise<string> {
  const base = slugify(name);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    if ((await db.business.count({ where: { slug: candidate } })) === 0) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export const GET = createHandler({
  method: "GET",
  auth: "required",
  handler: async ({ user }) => {
    if (!user) throw ApiError.unauthenticated();
    const business = await db.business.findFirst({
      where: { ownerId: user.id },
      include: BUSINESS_INCLUDE,
    });
    return { data: { business } };
  },
});

export const POST = createHandler({
  method: "POST",
  auth: "required",
  permission: "business.create",
  schema: {
    body: z.object({
      name: z.string().min(2).max(160),
      type: z.enum(["ACCOMMODATION", "GUIDE"]),
      email: z.string().email().optional(),
      phone: z.string().max(40).optional(),
      address: z.string().max(300).optional(),
      description: z.string().max(2000).optional(),
      destinationId: z.string().optional(),
    }),
  },
  handler: async ({ body, user, ip }) => {
    if (!user) throw ApiError.unauthenticated();

    const existing = await db.business.findFirst({
      where: { ownerId: user.id },
      select: { id: true },
    });
    if (existing) {
      throw ApiError.conflict("ONE_BUSINESS", "Each provider may own only one business");
    }

    const slug = await uniqueBusinessSlug(body.name);
    const destinationId =
      body.destinationId ??
      (await db.destination.findFirst({ where: { slug: "imedwan" }, select: { id: true } }))?.id ??
      null;
    const locale = isLocale(user.locale) ? user.locale : "en";

    const created = await db.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name: body.name,
          slug,
          type: body.type,
          status: "DRAFT",
          ownerId: user.id,
          email: body.email ?? user.email,
          phone: body.phone ?? null,
          address: body.address ?? null,
          destinationId,
          featured: false,
        },
      });
      await tx.businessTranslation.create({
        data: {
          businessId: business.id,
          locale,
          name: body.name,
          description: body.description ?? null,
        },
      });
      if (body.type === "ACCOMMODATION") {
        await tx.accommodation.create({ data: { businessId: business.id } });
      } else {
        await tx.guide.create({ data: { businessId: business.id } });
      }
      return business;
    });

    const business = await db.business.findUnique({
      where: { id: created.id },
      include: BUSINESS_INCLUDE,
    });

    void audit({
      actorId: user.id,
      action: "business.created",
      entityType: "business",
      entityId: created.id,
      ip,
      metadata: { type: body.type, slug },
    });

    return { status: 201, data: { business } };
  },
});
