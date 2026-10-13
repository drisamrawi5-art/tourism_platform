import { rateLimit } from '@/lib/rate-limit';
import { processPaymentWebhook } from '@/lib/payments/webhook';

/**
 * POST /api/v1/payments/webhook/[provider] — provider-to-platform callbacks.
 *
 * Deliberately NOT built on createHandler(): the raw body must survive
 * byte-for-byte for HMAC verification, and this endpoint is machine-facing
 * (the signature is the authentication; there is no session or CSRF token).
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const { provider } = await ctx.params;

  const d = await rateLimit(`webhook:${provider}`, { limit: 120, windowMs: 60000 });
  if (!d.ok) {
    return Response.json({ error: { code: 'RATE_LIMITED' } }, { status: 429 });
  }

  const raw = await req.text();
  try {
    const res = await processPaymentWebhook(provider, req, raw);
    return Response.json(res.body, { status: res.status });
  } catch (e) {
    console.error(e);
    return Response.json({ error: { code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}
