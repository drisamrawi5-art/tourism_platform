import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { getPaymentAdapter } from '@/lib/payments/registry';
import { processPaymentWebhook } from '@/lib/payments/webhook';
import {
  MOCK_SIGNATURE_HEADER,
  signMockPayload,
  type MockWebhookEventPayload,
} from '@/lib/payments/providers/mock';

/**
 * POST /api/v1/payments/mock/simulate — DEVELOPMENT ONLY.
 *
 * Emits a correctly HMAC-signed mock provider event and pushes it through the
 * REAL webhook processor (same verification, dedupe and state machine as a
 * production provider). The checkout page calls this with JSON; the event
 * signature is derived server-side from the webhook secret, never from HTML.
 */

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  paymentId: z.string().min(1),
  outcome: z.enum(['success', 'failure']),
  sig: z.string().min(1),
});

function notFound(): Response {
  return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
}

export async function POST(req: Request): Promise<Response> {
  try {
    if (env.isProd || getPaymentAdapter().key !== 'mock') return notFound();

    let parsedJson: unknown;
    try {
      parsedJson = await req.json();
    } catch {
      return Response.json({ error: { code: 'INVALID_JSON' } }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(parsedJson);
    if (!parsed.success) {
      return Response.json({ error: { code: 'VALIDATION_ERROR' } }, { status: 400 });
    }
    const { paymentId, outcome, sig } = parsed.data;

    if (sig !== signMockPayload(paymentId, env.paymentWebhookSecret)) {
      return Response.json({ error: { code: 'INVALID_SIGNATURE' } }, { status: 403 });
    }

    const payment = await db.payment.findUnique({ where: { id: paymentId } });
    if (!payment || !payment.externalId) return notFound();

    const payload: MockWebhookEventPayload = {
      id: `mockevt_${randomUUID()}`,
      type: outcome === 'success' ? 'payment.succeeded' : 'payment.failed',
      externalPaymentId: payment.externalId,
      amount: payment.amount.toString(),
      currency: payment.currency,
    };
    const raw = JSON.stringify(payload);
    const sig2 = signMockPayload(raw, env.paymentWebhookSecret);

    const signedReq = new Request(req.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [MOCK_SIGNATURE_HEADER]: sig2,
      },
      body: raw,
    });

    const res = await processPaymentWebhook('mock', signedReq, raw);
    return Response.json(res.body, { status: res.status });
  } catch (e) {
    console.error(e);
    return Response.json({ error: { code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}
