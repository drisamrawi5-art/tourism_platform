import { z } from 'zod';
import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { db } from '@/lib/db';
import { availabilityOverview } from '@/lib/booking/availability';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

const paramsSchema = z.object({ id: z.string().min(1) });
const querySchema = z.object({ from: dateOnly.optional(), to: dateOnly.optional() });

const DAY_MS = 86_400_000;
const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 90;

function parseDateOnly(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw ApiError.badRequest('INVALID_DATE', 'Invalid date');
  }
  return date;
}

/**
 * GET /api/v1/bookables/[id]/availability — public per-date capacity view.
 * Only PUBLISHED bookables of PUBLISHED businesses exist; default window is
 * today → +30 days, hard-capped at 90 days.
 */
export const GET = createHandler({
  method: 'GET',
  schema: { params: paramsSchema, query: querySchema },
  handler: async ({ params, query }) => {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const from = query.from ? parseDateOnly(query.from) : today;
    let to = query.to
      ? parseDateOnly(query.to)
      : new Date(from.getTime() + DEFAULT_WINDOW_DAYS * DAY_MS);
    if (to.getTime() < from.getTime()) {
      throw ApiError.badRequest('INVALID_RANGE', '`to` must not be before `from`');
    }
    if (to.getTime() - from.getTime() > MAX_WINDOW_DAYS * DAY_MS) {
      to = new Date(from.getTime() + MAX_WINDOW_DAYS * DAY_MS);
    }

    const bookable = await db.bookable.findUnique({
      where: { id: params.id },
      select: {
        status: true,
        category: true,
        business: { select: { status: true } },
      },
    });
    if (!bookable || bookable.status !== 'PUBLISHED' || bookable.business.status !== 'PUBLISHED') {
      throw ApiError.notFound('Not found');
    }

    const dates = await availabilityOverview({
      bookableId: params.id,
      category: bookable.category,
      from,
      to,
      tx: db,
    });

    return { data: { dates } };
  },
});
