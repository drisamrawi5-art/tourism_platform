import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * GET /api/v1/health — liveness/readiness probe.
 *
 * Returns 200 only when the database answers; 503 otherwise (so load
 * balancers and `scripts/health-check.mjs` can act on real state).
 * Never exposes configuration or secrets.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const started = Date.now();
  let database: "up" | "down" = "down";

  try {
    await db.$queryRaw`SELECT 1`;
    database = "up";
  } catch (error) {
    logger.error("health_db_down", { error: error instanceof Error ? error.message : String(error) });
  }

  const body = {
    status: database === "up" ? "ok" : "degraded",
    database,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    latencyMs: Date.now() - started,
  };

  return Response.json(body, {
    status: database === "up" ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
