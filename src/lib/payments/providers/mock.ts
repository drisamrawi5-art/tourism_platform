import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Payment } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';
import { env } from '@/lib/env';
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProviderAdapter,
  RefundResult,
  VerifiedWebhookEvent,
} from '@/lib/payments/types';

/**
 * Mock payment provider — DEVELOPMENT AND TESTING ONLY.
 *
 * Simulates a redirect-based provider with HMAC-signed webhooks so the full
 * server-side flow (create → checkout → webhook → verify → state machine) is
 * exercised end-to-end without moving money. It refuses to run in production.
 */

export const MOCK_SIGNATURE_HEADER = 'x-vi-signature';

export function signMockPayload(rawBody: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

export function verifyMockSignature(rawBody: string, header: string, secret: string): boolean {
  const expected = signMockPayload(rawBody, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(header ?? '');
  return a.length === b.length && timingSafeEqual(a, b);
}

export type MockWebhookEventPayload = {
  id: string;
  type: 'payment.succeeded' | 'payment.failed' | 'refund.succeeded' | 'refund.failed';
  externalPaymentId: string;
  amount?: string;
  currency?: string;
  externalRefundId?: string;
};

export class MockPaymentProvider implements PaymentProviderAdapter {
  readonly key = 'mock';

  isConfigured(): boolean {
    return env.paymentProvider === 'mock' && !env.isProd && env.paymentWebhookSecret.length >= 16;
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (env.isProd) {
      return { status: 'failed', message: 'Mock payments are disabled in production.' };
    }
    if (!this.isConfigured()) {
      return {
        status: 'not_configured',
        message:
          'Mock payments require PAYMENT_PROVIDER=mock and PAYMENT_WEBHOOK_SECRET (16+ chars).',
      };
    }

    const externalId = `mockpay_${randomUUID()}`;
    const sig = signMockPayload(input.payment.id, env.paymentWebhookSecret);
    const checkoutUrl = `/api/v1/payments/mock/checkout?paymentId=${encodeURIComponent(input.payment.id)}&sig=${encodeURIComponent(sig)}`;

    return { status: 'requires_action', checkoutUrl, externalId };
  }

  async refundPayment(_input: {
    payment: Payment;
    amount: Decimal;
    reason?: string;
    idempotencyKey: string;
  }): Promise<RefundResult> {
    if (!this.isConfigured()) {
      return { status: 'failed', message: 'Mock provider not configured.' };
    }
    return { status: 'succeeded', externalRefundId: `mockref_${randomUUID()}` };
  }

  async verifyWebhook(_req: Request, rawBody: string): Promise<VerifiedWebhookEvent> {
    if (!this.isConfigured()) {
      return { valid: false, reason: 'mock_provider_not_configured' };
    }
    const signature = _req.headers.get(MOCK_SIGNATURE_HEADER) ?? '';
    if (!verifyMockSignature(rawBody, signature, env.paymentWebhookSecret)) {
      return { valid: false, reason: 'invalid_signature' };
    }

    let parsed: MockWebhookEventPayload;
    try {
      parsed = JSON.parse(rawBody) as MockWebhookEventPayload;
    } catch {
      return { valid: false, reason: 'malformed_json' };
    }
    if (!parsed?.id || !parsed?.type || !parsed?.externalPaymentId) {
      return { valid: false, reason: 'missing_fields' };
    }
    const allowed = ['payment.succeeded', 'payment.failed', 'refund.succeeded', 'refund.failed'];
    if (!allowed.includes(parsed.type)) {
      return { valid: false, reason: 'unknown_event_type' };
    }

    return {
      valid: true,
      event: {
        id: parsed.id,
        type: parsed.type,
        externalPaymentId: parsed.externalPaymentId,
        amount: parsed.amount,
        currency: parsed.currency,
        externalRefundId: parsed.externalRefundId,
      },
    };
  }
}
