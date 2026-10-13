import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * First-party analytics events (spec section 61).
 * Only REAL events are recorded — no fabricated metrics anywhere.
 * Storage is a simple append table in V1; aggregation/dashboards read it
 * directly. A dedicated analytics backend can replace this module later
 * without touching call sites.
 */

export type AnalyticsEventType =
  | 'page_view'
  | 'place_view'
  | 'content_view'
  | 'accommodation_view'
  | 'guide_view'
  | 'search'
  | 'filter_applied'
  | 'wishlist_added'
  | 'wishlist_removed'
  | 'booking_started'
  | 'booking_completed'
  | 'payment_success'
  | 'payment_failure'
  | 'provider_onboarding_started'
  | 'provider_onboarding_submitted';

export async function recordEvent(
  type: AnalyticsEventType | string,
  input: {
    entityType?: string;
    entityId?: string;
    path?: string;
    userId?: string | null;
    sessionId?: string | null;
    meta?: Record<string, unknown>;
  } = {},
): Promise<void> {
  try {
    await db.analyticsEvent.create({
      data: {
        type,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        path: input.path?.slice(0, 500) ?? null,
        userId: input.userId ?? null,
        sessionId: input.sessionId ?? null,
        meta: (input.meta as object) ?? undefined,
      },
    });
  } catch (error) {
    // Analytics must never break user flows.
    logger.warn('analytics_write_failed', {
      type,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Aggregate counts for admin dashboards (real data only). */
export async function countEvents(type: AnalyticsEventType | string, since: Date): Promise<number> {
  return db.analyticsEvent.count({ where: { type, createdAt: { gte: since } } });
}
