import type { Payment, Booking } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

/**
 * Payment abstraction (spec sections 35–36).
 *
 * The application NEVER couples to one payment provider. Concrete adapters
 * implement this interface and are selected via PAYMENT_PROVIDER.
 *
 * Hard rules:
 * - Card data never reaches our servers (redirect/hosted flows).
 * - Booking state changes happen ONLY through verified server-side webhooks
 *   (processWebhook) — never from frontend redirects.
 * - No adapter may claim success without genuine verification.
 */

export type PaymentEventType =
  'payment.succeeded' | 'payment.failed' | 'refund.succeeded' | 'refund.failed';

export type CreatePaymentInput = {
  payment: Pick<Payment, 'id' | 'amount' | 'currency' | 'mode'> & { amount: Decimal };
  booking: Pick<Booking, 'id' | 'reference' | 'total' | 'depositAmount' | 'paymentMode'>;
  customer: { email: string | null; name: string | null };
  /** Where the customer returns after the provider's hosted checkout. */
  returnUrl: string;
};

export type CreatePaymentResult =
  /** Redirect the customer to the provider-hosted checkout. */
  | { status: 'requires_action'; checkoutUrl: string; externalId?: string }
  /** Payment captured immediately (rare; e.g. saved methods). */
  | { status: 'succeeded'; externalId?: string }
  /** Platform has no payment provider configured — surface honestly in UI. */
  | { status: 'not_configured'; message: string }
  | { status: 'failed'; message: string };

export type VerifiedWebhookEvent =
  | {
      valid: true;
      event: {
        /** Provider-side unique event id (idempotency key). */
        id: string;
        type: PaymentEventType;
        externalPaymentId: string;
        amount?: string;
        currency?: string;
        externalRefundId?: string;
      };
    }
  | { valid: false; reason: string };

export type RefundResult =
  | { status: 'succeeded'; externalRefundId?: string }
  | { status: 'not_supported'; message: string }
  | { status: 'failed'; message: string };

export interface PaymentProviderAdapter {
  readonly key: string;
  /** False when env/config for this provider is incomplete. */
  isConfigured(): boolean;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  refundPayment(input: {
    payment: Payment;
    amount: Decimal;
    reason?: string;
    idempotencyKey: string;
  }): Promise<RefundResult>;
  /**
   * Verify authenticity of a webhook delivery. Implementations MUST verify
   * signatures with a server-side secret before parsing business content.
   */
  verifyWebhook(req: Request, rawBody: string): Promise<VerifiedWebhookEvent>;
}
