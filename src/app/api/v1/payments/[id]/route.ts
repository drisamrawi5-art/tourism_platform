import { z } from 'zod';
import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { roleHasPermission } from '@/lib/auth/permissions';
import { db } from '@/lib/db';

const paramsSchema = z.object({ id: z.string().min(1) });

/**
 * GET /api/v1/payments/[id] — owner of the booking or anyone with
 * `payment.read`; everyone else gets 404 (no existence oracle).
 * Never exposes `providerPayload`.
 */
export const GET = createHandler({
  method: 'GET',
  auth: 'required',
  schema: { params: paramsSchema },
  handler: async ({ params, user }) => {
    const payment = await db.payment.findUnique({
      where: { id: params.id },
      include: { booking: { select: { customerId: true } } },
    });
    if (
      !payment ||
      (payment.booking.customerId !== user!.id && !roleHasPermission(user!.role, 'payment.read'))
    ) {
      throw ApiError.notFound('Payment not found');
    }

    return {
      data: {
        id: payment.id,
        bookingId: payment.bookingId,
        status: payment.status,
        amount: payment.amount.toString(),
        currency: payment.currency,
        mode: payment.mode,
        provider: payment.provider,
        externalId: payment.externalId,
        createdAt: payment.createdAt,
      },
    };
  },
});
