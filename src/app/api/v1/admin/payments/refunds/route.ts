import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { issueRefund } from '@/lib/payments/service';
import { RATE_LIMITS } from '@/lib/rate-limit';

const bodySchema = z.object({
  bookingId: z.string().min(1),
  amount: z.number().positive().optional(),
  reason: z.string().max(500).optional(),
  /** Client-supplied so retried refund requests reuse the same Refund row. */
  idempotencyKey: z.string().min(8).max(120),
});

/** POST /api/v1/admin/payments/refunds — issue a (partial) refund on a booking. */
export const POST = createHandler({
  method: 'POST',
  auth: 'required',
  permission: 'payment.refund',
  rateLimit: RATE_LIMITS.payment,
  schema: { body: bodySchema },
  handler: async ({ body, user }) => {
    if (!user) throw ApiError.unauthenticated();

    const result = await issueRefund({
      bookingId: body.bookingId,
      actorId: user.id,
      amount: body.amount ?? null,
      reason: body.reason,
      idempotencyKey: body.idempotencyKey,
    });

    return { data: result };
  },
});
