import { z } from 'zod';
import { createHandler } from '@/lib/api/handler';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { initiatePayment } from '@/lib/payments/service';
import { env } from '@/lib/env';

const bodySchema = z.object({
  bookingId: z.string().min(1),
  mode: z.enum(['FULL', 'DEPOSIT']),
});

/** POST /api/v1/payments — start a payment for the caller's own booking. */
export const POST = createHandler({
  method: 'POST',
  auth: 'required',
  rateLimit: RATE_LIMITS.payment,
  schema: { body: bodySchema },
  handler: async ({ body, req, user }) => {
    const header = req.headers.get('idempotency-key');
    const idempotencyKey = header === null ? null : z.string().min(8).max(100).parse(header);

    const result = await initiatePayment({
      bookingId: body.bookingId,
      customerId: user!.id,
      mode: body.mode,
      idempotencyKey,
      returnUrl: `${env.appUrl}/${user!.locale || 'en'}/account/bookings`,
    });

    return { data: result };
  },
});
