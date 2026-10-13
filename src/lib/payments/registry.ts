import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { NonePaymentProvider } from '@/lib/payments/providers/none';
import { MockPaymentProvider } from '@/lib/payments/providers/mock';
import type { PaymentProviderAdapter } from '@/lib/payments/types';

/**
 * Payment provider registry (spec section 35).
 * Select via PAYMENT_PROVIDER env: "none" (default) | "mock" (dev/test) |
 * future providers are added here without touching booking logic.
 */

const registry = new Map<string, PaymentProviderAdapter>();

function register(adapter: PaymentProviderAdapter): void {
  registry.set(adapter.key, adapter);
}

register(new NonePaymentProvider());
register(new MockPaymentProvider()); // refuses to operate in production

let warned = false;

export function getPaymentAdapter(key: string = env.paymentProvider): PaymentProviderAdapter {
  const adapter = registry.get(key.toLowerCase());
  if (!adapter) {
    if (!warned) {
      logger.warn('payment_provider_unknown', { key, fallback: 'none' });
      warned = true;
    }
    return registry.get('none')!;
  }
  return adapter;
}

/** Register additional adapters (future providers / tests). */
export function registerPaymentAdapter(adapter: PaymentProviderAdapter): void {
  registry.set(adapter.key, adapter);
}
