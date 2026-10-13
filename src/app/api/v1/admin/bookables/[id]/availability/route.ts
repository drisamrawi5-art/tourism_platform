import { z } from 'zod';
import { availabilityOverview } from '@/lib/booking/availability';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { db } from '@/lib/db';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isoDay(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

export const GET = createHandler({
  method: 'GET',
  auth: 'required',
  permission: 'business.read',
  schema: {
    params: z.object({ id: z.string().min(1) }),
    query: z.object({
      from: z.string().regex(DATE_RE).optional(),
      to: z.string().regex(DATE_RE).optional(),
    }),
  },
  handler: async ({ params, query, user }) => {
    if (!user) throw ApiError.unauthenticated();

    const bookable = await db.bookable.findUnique({
      where: { id: params.id },
      select: { id: true, category: true },
    });
    if (!bookable) throw ApiError.notFound();

    const fromStr = query.from ?? isoDay(0);
    const toStr = query.to ?? isoDay(30);
    if (toStr < fromStr) {
      throw ApiError.badRequest('INVALID_RANGE', '`to` must be on or after `from`');
    }

    const dates = await availabilityOverview({
      bookableId: bookable.id,
      category: bookable.category,
      from: new Date(`${fromStr}T00:00:00.000Z`),
      to: new Date(`${toStr}T00:00:00.000Z`),
      tx: db,
    });

    return { data: { dates } };
  },
});
