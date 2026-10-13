import { createHandler } from '@/lib/api/handler';
import { getPaymentAdapter } from '@/lib/payments/registry';

/**
 * GET /api/v1/admin/payments/status — which payment provider is active and
 * whether online payments are configured at all. The "none" adapter means
 * bookings can be created but never paid online; the admin payments page
 * surfaces this honestly instead of implying checkout works.
 */
export const GET = createHandler({
  method: 'GET',
  auth: 'required',
  permission: 'payment.read',
  handler: async () => {
    const adapter = getPaymentAdapter();
    return {
      data: {
        provider: adapter.key,
        configured: adapter.key !== 'none',
      },
    };
  },
});
