import { createHandler } from '@/lib/api/handler';
import { env } from '@/lib/env';
import { getPaymentAdapter } from '@/lib/payments/registry';
import { FEATURE_FLAG_KEYS, getSetting, isFeatureEnabled } from '@/lib/settings';

export const GET = createHandler({
  method: 'GET',
  auth: 'none',
  handler: async () => {
    const paymentConfigured = getPaymentAdapter().isConfigured();
    const currency = await getSetting('currency.default');
    const flagValues = await Promise.all(FEATURE_FLAG_KEYS.map((key) => isFeatureEnabled(key)));
    const features: Record<string, boolean> = {};
    FEATURE_FLAG_KEYS.forEach((key, index) => {
      features[key] = flagValues[index] === true;
    });

    return {
      data: {
        paymentConfigured,
        paymentProvider: env.paymentProvider,
        mapProvider: env.mapProvider,
        currency: String(currency),
        features,
      },
    };
  },
});
