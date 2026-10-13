import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProviderAdapter,
  RefundResult,
  VerifiedWebhookEvent,
} from '@/lib/payments/types';
import type { Payment } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

/**
 * "none" provider — selected when PAYMENT_PROVIDER is unset/none.
 *
 * Bookings can still be created (hosts arrange payment directly), but online
 * checkout honestly reports that payments are not configured. NOTHING is
 * faked.
 */

export class NonePaymentProvider implements PaymentProviderAdapter {
  readonly key = 'none';

  isConfigured(): boolean {
    return false;
  }

  async createPayment(_input: CreatePaymentInput): Promise<CreatePaymentResult> {
    return {
      status: 'not_configured',
      message: 'No payment provider is configured on this platform.',
    };
  }

  async refundPayment(_input: {
    payment: Payment;
    amount: Decimal;
    reason?: string;
    idempotencyKey: string;
  }): Promise<RefundResult> {
    return { status: 'not_supported', message: 'No payment provider is configured.' };
  }

  async verifyWebhook(_req: Request, _rawBody: string): Promise<VerifiedWebhookEvent> {
    return { valid: false, reason: 'no_provider' };
  }
}
