import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { db } from '@/lib/db';

export const GET = createHandler({
  method: 'GET',
  auth: 'required',
  permission: 'business.read',
  schema: { params: z.object({ id: z.string().min(1) }) },
  handler: async ({ params, user }) => {
    if (!user) throw ApiError.unauthenticated();

    const bookable = await db.bookable.findUnique({
      where: { id: params.id },
      include: {
        business: { select: { id: true, name: true, slug: true, status: true, ownerId: true } },
        prices: true,
        availabilityRules: true,
        availabilityBlocks: true,
        unit: true,
        guideService: true,
      },
    });
    if (!bookable) throw ApiError.notFound();

    return { data: { bookable } };
  },
});
