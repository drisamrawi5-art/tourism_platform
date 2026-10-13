import { z } from 'zod';
import { createHandler } from '@/lib/api/handler';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { db } from '@/lib/db';

const paramsSchema = z.object({
  target: z.enum(['place', 'accommodation', 'guide']),
  id: z.string().min(1),
});

/** DELETE /api/v1/wishlist/[target]/[id] — remove an item from own wishlist. */
export const DELETE = createHandler({
  method: 'DELETE',
  auth: 'required',
  rateLimit: RATE_LIMITS.generic,
  schema: { params: paramsSchema },
  handler: async ({ params, user }) => {
    await db.wishlistItem.deleteMany({
      where: {
        userId: user!.id,
        ...(params.target === 'place' ? { placeId: params.id } : { businessId: params.id }),
      },
    });
    return { data: { ok: true } };
  },
});
