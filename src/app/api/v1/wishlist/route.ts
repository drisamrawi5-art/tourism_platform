import { z } from 'zod';
import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { db } from '@/lib/db';

const bodySchema = z.object({
  target: z.enum(['place', 'accommodation', 'guide']),
  id: z.string().min(1),
});

const itemInclude = {
  place: { select: { id: true, slug: true, translations: true } },
  business: {
    select: { id: true, slug: true, type: true, translations: true },
  },
} as const;

/** GET /api/v1/wishlist — the caller's own wishlist (private per user). */
export const GET = createHandler({
  method: 'GET',
  auth: 'required',
  handler: async ({ user }) => {
    const items = await db.wishlistItem.findMany({
      where: { userId: user!.id },
      include: itemInclude,
      orderBy: { createdAt: 'desc' },
    });
    return { data: items };
  },
});

/**
 * POST /api/v1/wishlist — save a place or a published accommodation/guide
 * business. Idempotent: repeating a save returns the existing item (200).
 */
export const POST = createHandler({
  method: 'POST',
  auth: 'required',
  rateLimit: RATE_LIMITS.generic,
  schema: { body: bodySchema },
  handler: async ({ body, user }) => {
    const { target, id } = body;

    if (target === 'place') {
      const place = await db.place.findUnique({
        where: { id },
        select: { id: true, status: true },
      });
      if (!place || place.status !== 'PUBLISHED') throw ApiError.notFound('Not found');
    } else {
      const type = target === 'accommodation' ? 'ACCOMMODATION' : 'GUIDE';
      const business = await db.business.findFirst({
        where: { id, status: 'PUBLISHED', type },
        select: { id: true },
      });
      if (!business) throw ApiError.notFound('Not found');
    }

    const existing = await db.wishlistItem.findFirst({
      where: {
        userId: user!.id,
        ...(target === 'place' ? { placeId: id } : { businessId: id }),
      },
      include: itemInclude,
    });
    if (existing) return { status: 200, data: { item: existing } };

    const item = await db.wishlistItem.create({
      data: {
        userId: user!.id,
        placeId: target === 'place' ? id : null,
        businessId: target === 'place' ? null : id,
      },
      include: itemInclude,
    });

    return { status: 201, data: { item } };
  },
});
