import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { db } from '@/lib/db';

const DAY_MS = 86_400_000;

function utcDayStart(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export const GET = createHandler({
  method: 'GET',
  auth: 'required',
  permission: 'analytics.read',
  schema: {
    query: z.object({
      days: z.string().optional(),
    }),
  },
  handler: async ({ query, user }) => {
    if (!user) throw ApiError.unauthenticated();

    const days = z.coerce.number().int().min(7).max(365).default(30).parse(query.days);

    const now = Date.now();
    const gte = new Date(now - days * DAY_MS);

    const [eventGroups, bookingRows, pathGroups] = await Promise.all([
      db.analyticsEvent.groupBy({
        by: ['type'],
        where: { createdAt: { gte } },
        _count: { _all: true },
      }),
      db.booking.findMany({
        where: { createdAt: { gte } },
        select: { createdAt: true, status: true },
      }),
      db.analyticsEvent.groupBy({
        by: ['path'],
        where: { type: 'page_view', createdAt: { gte }, path: { not: null } },
        _count: { _all: true },
      }),
    ]);

    const events = eventGroups.map((row) => ({
      type: row.type,
      count: row._count._all,
    }));

    const countsByDay = new Map<string, number>();
    for (const row of bookingRows) {
      const key = row.createdAt.toISOString().slice(0, 10);
      countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
    }

    const bookingsPerDay: Array<{ date: string; count: number }> = [];
    const first = utcDayStart(gte);
    const today = utcDayStart(new Date(now));
    for (let t = first; t <= today; t += DAY_MS) {
      const date = new Date(t).toISOString().slice(0, 10);
      bookingsPerDay.push({ date, count: countsByDay.get(date) ?? 0 });
    }

    const topPaths = pathGroups
      .map((row) => ({ path: row.path ?? '', count: row._count._all }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      data: {
        events,
        bookingsPerDay,
        topPaths,
        totals: {
          events: events.reduce((sum, e) => sum + e.count, 0),
          bookings: bookingRows.length,
        },
      },
    };
  },
});
