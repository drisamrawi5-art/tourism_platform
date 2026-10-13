import { z } from "zod";
import { createHandler } from "@/lib/api/handler";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { recordEvent, type AnalyticsEventType } from "@/lib/analytics";

/**
 * POST /api/v1/events — first-party analytics beacon (spec section 61).
 * Only whitelisted event types are accepted; payload sizes are capped.
 * Analytics never break the caller: the route always answers 202.
 */

const EVENT_TYPES: readonly AnalyticsEventType[] = [
  "page_view",
  "place_view",
  "content_view",
  "accommodation_view",
  "guide_view",
  "search",
  "filter_applied",
  "wishlist_added",
  "wishlist_removed",
  "booking_started",
  "booking_completed",
  "payment_success",
  "payment_failure",
  "provider_onboarding_started",
  "provider_onboarding_submitted",
];

const bodySchema = z.object({
  type: z.enum(EVENT_TYPES as unknown as [AnalyticsEventType, ...AnalyticsEventType[]]),
  entityType: z.string().max(40).optional(),
  entityId: z.string().max(64).optional(),
  path: z.string().max(500).optional(),
  meta: z.record(z.unknown()).optional(),
});

export const POST = createHandler({
  method: "POST",
  auth: "optional",
  schema: { body: bodySchema },
  rateLimit: { ...RATE_LIMITS.generic, scope: "events" },
  handler: async ({ body, user, userAgent }) => {
    await recordEvent(body.type, {
      entityType: body.entityType,
      entityId: body.entityId,
      path: body.path,
      userId: user?.id ?? null,
      meta: { ...(body.meta ?? {}), ua: userAgent?.slice(0, 120) },
    });
    return { status: 202, data: { recorded: true } };
  },
});
