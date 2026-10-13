import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { createHandler, paginated, parsePagination } from "@/lib/api/handler";
import { db } from "@/lib/db";

const BOOKABLE_INCLUDE = {
  prices: true,
  availabilityRules: true,
  availabilityBlocks: true,
  unit: { select: { name: true, description: true, capacity: true } },
  guideService: { select: { name: true, description: true } },
} as const;

function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "bookable";
}

async function uniqueBookableSlug(name: string): Promise<string> {
  const base = slugify(name);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    if ((await db.bookable.count({ where: { slug: candidate } })) === 0) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export const GET = createHandler({
  method: "GET",
  auth: "required",
  handler: async ({ query, user, requestId }) => {
    const pagination = parsePagination(query);
    const where: Prisma.BookableWhereInput = { business: { ownerId: user!.id } };
    const [items, total] = await Promise.all([
      db.bookable.findMany({
        where,
        include: BOOKABLE_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take,
      }),
      db.bookable.count({ where }),
    ]);
    return paginated(items, total, pagination, requestId);
  },
});

export const POST = createHandler({
  method: "POST",
  auth: "required",
  permission: "service.manage",
  schema: {
    body: z.object({
      businessId: z.string().min(1),
      category: z.enum(["ACCOMMODATION", "GUIDE"]),
      name: z.string().min(2).max(160),
      description: z.string().max(1000).optional(),
      capacity: z.number().int().min(1).max(100).default(2),
      pricingUnit: z.enum(["NIGHT", "PERSON", "DAY", "SERVICE"]),
      amount: z.number().positive().max(999999),
    }),
  },
  handler: async ({ body, user }) => {
    const business = await db.business.findFirst({
      where: { id: body.businessId, ownerId: user!.id },
    });
    if (!business) throw ApiError.notFound();
    if (business.type !== body.category) {
      throw ApiError.badRequest(
        "CATEGORY_MISMATCH",
        `Business type ${business.type} does not match bookable category ${body.category}`,
      );
    }

    const slug = await uniqueBookableSlug(body.name);

    const created = await db.$transaction(async (tx) => {
      const bookable = await tx.bookable.create({
        data: {
          businessId: business.id,
          category: body.category,
          slug,
          status: "DRAFT",
          capacity: body.capacity,
        },
      });

      if (body.category === "ACCOMMODATION") {
        const accommodation =
          (await tx.accommodation.findUnique({ where: { businessId: business.id } })) ??
          (await tx.accommodation.create({ data: { businessId: business.id } }));
        await tx.accommodationUnit.create({
          data: {
            accommodationId: accommodation.id,
            bookableId: bookable.id,
            name: body.name,
            description: body.description ?? null,
            capacity: body.capacity,
          },
        });
      } else {
        const guide =
          (await tx.guide.findUnique({ where: { businessId: business.id } })) ??
          (await tx.guide.create({ data: { businessId: business.id } }));
        await tx.guideService.create({
          data: {
            guideId: guide.id,
            bookableId: bookable.id,
            name: body.name,
            description: body.description ?? null,
          },
        });
      }

      await tx.price.create({
        data: {
          bookableId: bookable.id,
          unit: body.pricingUnit,
          amount: body.amount,
          currency: "MAD",
          active: true,
          priority: 0,
        },
      });

      return bookable;
    });

    const bookable = await db.bookable.findUnique({
      where: { id: created.id },
      include: { unit: true, guideService: true, prices: true },
    });

    return { status: 201, data: { bookable } };
  },
});
