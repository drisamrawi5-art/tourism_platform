import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * Database-backed fixed-window rate limiting (spec section 73).
 * Works across multiple server instances (unlike in-memory counters).
 */

export type RateLimitRule = {
  limit: number;
  windowMs: number;
  /** Bucket namespace — defaults to request path in the handler. */
  scope?: string;
  /** Overrides the identifier part of the key (e.g. email instead of ip). */
  key?: string;
};

export type RateLimitDecision = {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
};

export async function rateLimit(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
  const now = Date.now();
  const windowStartMs = Math.floor(now / rule.windowMs) * rule.windowMs;
  const windowStart = new Date(windowStartMs);
  const retryAfterMs = windowStartMs + rule.windowMs - now;

  try {
    const decision = await db.$transaction(async (tx) => {
      const row = await tx.rateLimit.findUnique({ where: { key } });

      if (!row || row.windowStart.getTime() < windowStartMs) {
        await tx.rateLimit.upsert({
          where: { key },
          create: { key, windowStart, count: 1 },
          update: { windowStart, count: 1 },
        });
        return { ok: true, remaining: rule.limit - 1, retryAfterMs: 0 };
      }

      if (row.count >= rule.limit) {
        return { ok: false, remaining: 0, retryAfterMs };
      }

      await tx.rateLimit.update({
        where: { key },
        data: { count: { increment: 1 } },
      });
      return { ok: true, remaining: rule.limit - row.count - 1, retryAfterMs: 0 };
    });

    if (!decision.ok) {
      logger.warn('rate_limited', { key: key.slice(0, 120), limit: rule.limit });
    }
    return decision;
  } catch (error) {
    // Fail closed for safety: if the limiter store is unavailable, block the
    // request rather than bypassing protection on sensitive endpoints.
    logger.error('rate_limit_store_error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, remaining: 0, retryAfterMs: Math.min(retryAfterMs || 1000, 60_000) };
  }
}

/** Common rules (kept in one place so limits are auditable). */
export const RATE_LIMITS = {
  login: { limit: 10, windowMs: 5 * 60_000 } satisfies RateLimitRule,
  register: { limit: 5, windowMs: 60 * 60_000 } satisfies RateLimitRule,
  passwordReset: { limit: 5, windowMs: 60 * 60_000 } satisfies RateLimitRule,
  emailVerify: { limit: 10, windowMs: 60 * 60_000 } satisfies RateLimitRule,
  search: { limit: 60, windowMs: 60_000 } satisfies RateLimitRule,
  booking: { limit: 20, windowMs: 10 * 60_000 } satisfies RateLimitRule,
  payment: { limit: 20, windowMs: 10 * 60_000 } satisfies RateLimitRule,
  review: { limit: 5, windowMs: 60 * 60_000 } satisfies RateLimitRule,
  comment: { limit: 10, windowMs: 60 * 60_000 } satisfies RateLimitRule,
  upload: { limit: 30, windowMs: 60 * 60_000 } satisfies RateLimitRule,
  generic: { limit: 120, windowMs: 60_000 } satisfies RateLimitRule,
} as const;

/** Housekeeping: drop stale limiter rows (scheduled job). */
export async function purgeStaleRateLimits(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 3600_000);
  const res = await db.rateLimit.deleteMany({ where: { updatedAt: { lt: cutoff } } });
  return res.count;
}
