import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { daysAgo } from '../_shared/queries';

const DEFAULT_ANALYTICS_DAYS = 30;
const MIN_ANALYTICS_DAYS = 1;
const MAX_ANALYTICS_DAYS = 90;
const TOP_PATHS_LIMIT = 10;

/** Conversion funnel event types tracked by the platform. */
const ANALYTICS_FUNNEL_TYPES = [
  'booking_started',
  'booking_completed',
  'payment_success',
  'payment_failure',
] as const;

const querySchema = z.object({
  days: z.string().optional(),
});

/** GET /api/v1/admin/analytics — real event aggregates over a clamped window. */
export const GET = createHandler({
  method: 'GET',
  auth: 'required',
  permission: 'analytics.read',
  schema: { query: querySchema },
  handler: async ({ query, user }) => {
    if (!user) throw ApiError.unauthenticated();

    const parsedDays = Number.parseInt(query.days ?? String(DEFAULT_ANALYTICS_DAYS), 10);
    const days = Number.isFinite(parsedDays)
      ? Math.min(Math.max(parsedDays, MIN_ANALYTICS_DAYS), MAX_ANALYTICS_DAYS)
      : DEFAULT_ANALYTICS_DAYS;
    const since = daysAgo(days);

    const [eventsByTypeRows, topPathRows, dailyCounts, funnelRows] = await Promise.all([
      db.analyticsEvent.groupBy({
        by: ['type'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        orderBy: { _count: { type: 'desc' } },
      }),
      db.analyticsEvent.groupBy({
        by: ['path'],
        where: { createdAt: { gte: since }, path: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { path: 'desc' } },
        take: TOP_PATHS_LIMIT,
      }),
      db.$queryRaw<Array<{ date: string; count: number }>>`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS date,
               COUNT(*)::int AS count
        FROM analytics_events
        WHERE "createdAt" >= ${since}
        GROUP BY 1
        ORDER BY 1
      `,
      db.analyticsEvent.groupBy({
        by: ['type'],
        where: { type: { in: [...ANALYTICS_FUNNEL_TYPES] }, createdAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);

    const funnelCountsByType = new Map(funnelRows.map((row) => [row.type, row._count._all]));

    return {
      data: {
        days,
        eventsByType: eventsByTypeRows.map((row) => ({
          type: row.type,
          count: row._count._all,
        })),
        topPaths: topPathRows
          .filter((row) => row.path !== null)
          .map((row) => ({ path: row.path, count: row._count._all })),
        dailyCounts: dailyCounts.map((row) => ({ date: row.date, count: row.count })),
        funnel: {
          booking_started: funnelCountsByType.get('booking_started') ?? 0,
          booking_completed: funnelCountsByType.get('booking_completed') ?? 0,
          payment_success: funnelCountsByType.get('payment_success') ?? 0,
          payment_failure: funnelCountsByType.get('payment_failure') ?? 0,
        },
      },
    };
  },
});
