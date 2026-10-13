import { z } from 'zod';
import { audit } from '@/lib/audit';
import { createHandler } from '@/lib/api/handler';
import { issueRefund } from '@/lib/payments/service';
import { RATE_LIMITS } from '@/lib/rate-limit';

export const POST = createHandler({
  method: 'POST',
  auth: 'required',
  permission: 'payment.refund',
  rateLimit: RATE_LIMITS.payment,
  schema: {
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
      amount: z.number().positive().optional(),
      reason: z.string().max(500).optional(),
      idempotencyKey: z.string().min(8).max(100),
    }),
  },
  handler: async ({ params, body, user, ip }) => {
    const result = await issueRefund({
      bookingId: params.id,
      actorId: user!.id,
      amount: body.amount ?? null,
      reason: body.reason,
      idempotencyKey: body.idempotencyKey,
    });

    void audit({
      actorId: user!.id,
      action: 'payment.refunded',
      entityType: 'booking',
      entityId: params.id,
      ip,
      metadata: { bookingId: params.id, refundId: result.refundId, amount: body.amount ?? null },
    });

    return { data: result };
  },
});
