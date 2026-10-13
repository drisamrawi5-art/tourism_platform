import { db } from '@/lib/db';
import { ApiError } from '@/lib/api/errors';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';
import { getPaymentAdapter } from '@/lib/payments/registry';
import { env } from '@/lib/env';
import { notify } from '@/lib/notifications';

/**
 * Payment orchestration (spec sections 34–35).
 *
 * - Amounts always come from the booking row (server-computed at creation).
 * - createPayment is idempotent per (booking, key).
 * - Successful state changes happen only in the webhook processor.
 */

export type InitiatePaymentResult = {
  paymentId: string;
  status: 'requires_action' | 'succeeded' | 'not_configured' | 'failed';
  checkoutUrl?: string;
  message?: string;
  amount: string;
  currency: string;
  mode: 'FULL' | 'DEPOSIT';
};

export async function initiatePayment(input: {
  bookingId: string;
  customerId: string;
  mode: 'FULL' | 'DEPOSIT';
  idempotencyKey?: string | null;
  returnUrl?: string;
}): Promise<InitiatePaymentResult> {
  const booking = await db.booking.findUnique({
    where: { id: input.bookingId },
    include: { payments: { where: { status: { in: ['UNPAID'] } } } },
  });

  // Scoped by customer id — IDOR-safe (foreign bookings simply do not exist).
  if (!booking || booking.customerId !== input.customerId) {
    throw ApiError.notFound('Booking not found');
  }
  if (booking.status === 'CANCELLED' || booking.status === 'REFUNDED') {
    throw ApiError.conflict('BOOKING_CLOSED', 'This booking can no longer be paid');
  }
  if (booking.paymentStatus === 'PAID') {
    throw ApiError.conflict('ALREADY_PAID', 'This booking is already fully paid');
  }

  let amount: number;
  if (input.mode === 'DEPOSIT') {
    if (!booking.depositEnabled || booking.depositAmount === null) {
      throw ApiError.badRequest(
        'DEPOSIT_NOT_AVAILABLE',
        'Deposit payment is not available for this booking',
      );
    }
    amount = Number(booking.depositAmount.toString());
  } else {
    // Pay the outstanding balance if a deposit was already made.
    const outstanding = Number(booking.total.toString()) - Number(booking.amountPaid.toString());
    if (outstanding <= 0) {
      throw ApiError.conflict('ALREADY_PAID', 'Nothing left to pay');
    }
    amount = outstanding;
  }

  // Idempotency: reuse the open payment for the same key.
  const idempotencyKey =
    input.idempotencyKey ?? `pay_${input.bookingId}_${input.mode}_${booking.amountPaid.toString()}`;
  const existing = await db.payment.findUnique({ where: { idempotencyKey } });
  if (existing) {
    const adapter = getPaymentAdapter();
    if (existing.externalId && adapter.key !== 'none') {
      // Recreate the checkout session through the adapter if still unpaid.
      const adapterResult = await adapter.createPayment({
        payment: {
          id: existing.id,
          amount: existing.amount,
          currency: existing.currency,
          mode: existing.mode,
        },
        booking: {
          id: booking.id,
          reference: booking.reference,
          total: booking.total,
          depositAmount: booking.depositAmount,
          paymentMode: booking.paymentMode,
        },
        customer: { email: booking.customerEmail, name: booking.customerName },
        returnUrl: input.returnUrl ?? `${env.appUrl}/en/account/bookings/${booking.id}`,
      });
      return {
        paymentId: existing.id,
        status: adapterResult.status,
        checkoutUrl:
          adapterResult.status === 'requires_action' ? adapterResult.checkoutUrl : undefined,
        message: adapterResult.status === 'not_configured' ? adapterResult.message : undefined,
        amount: existing.amount.toString(),
        currency: existing.currency,
        mode: existing.mode,
      };
    }
    return {
      paymentId: existing.id,
      status: existing.status === 'PAID' ? 'succeeded' : 'failed',
      amount: existing.amount.toString(),
      currency: existing.currency,
      mode: existing.mode,
    };
  }

  const payment = await db.payment.create({
    data: {
      bookingId: booking.id,
      provider: env.paymentProvider,
      mode: input.mode,
      status: 'UNPAID',
      amount,
      currency: booking.currency,
      idempotencyKey,
    },
  });

  void audit({
    actorId: input.customerId,
    action: AUDIT_ACTIONS.paymentCreated,
    entityType: 'payment',
    entityId: payment.id,
    metadata: { reference: booking.reference, amount, mode: input.mode },
  });

  const adapter = getPaymentAdapter();
  if (!adapter.isConfigured()) {
    return {
      paymentId: payment.id,
      status: 'not_configured',
      message: 'No payment provider is configured on this platform.',
      amount: payment.amount.toString(),
      currency: payment.currency,
      mode: input.mode,
    };
  }

  const result = await adapter.createPayment({
    payment: {
      id: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      mode: payment.mode,
    },
    booking: {
      id: booking.id,
      reference: booking.reference,
      total: booking.total,
      depositAmount: booking.depositAmount,
      paymentMode: booking.paymentMode,
    },
    customer: { email: booking.customerEmail, name: booking.customerName },
    returnUrl: input.returnUrl ?? `${env.appUrl}/en/account/bookings/${booking.id}`,
  });

  if (result.status === 'requires_action' && result.externalId) {
    await db.payment.update({
      where: { id: payment.id },
      data: { externalId: result.externalId, provider: adapter.key },
    });
  }

  return {
    paymentId: payment.id,
    status: result.status,
    checkoutUrl: result.status === 'requires_action' ? result.checkoutUrl : undefined,
    message: result.status === 'failed' ? result.message : undefined,
    amount: payment.amount.toString(),
    currency: payment.currency,
    mode: input.mode,
  };
}

/**
 * Issue a refund (admin). The Refund row is the idempotency anchor; final
 * settlement arrives via the provider webhook (refund.succeeded).
 */
export async function issueRefund(input: {
  bookingId: string;
  actorId: string;
  amount?: number | null;
  reason?: string;
  idempotencyKey: string;
}): Promise<{ refundId: string; status: string; message?: string }> {
  const booking = await db.booking.findUnique({
    where: { id: input.bookingId },
    include: { payments: { where: { status: 'PAID' }, orderBy: { createdAt: 'desc' } } },
  });
  if (!booking) throw ApiError.notFound('Booking not found');

  const paid = Number(booking.amountPaid.toString());
  const refunded = Number(booking.amountRefunded.toString());
  const outstanding = paid - refunded;
  if (outstanding <= 0) {
    throw ApiError.conflict('NOTHING_TO_REFUND', 'No refundable amount on this booking');
  }

  const amount = input.amount ? Math.min(input.amount, outstanding) : outstanding;
  if (amount <= 0) {
    throw ApiError.badRequest('INVALID_REFUND_AMOUNT', 'Refund amount must be positive');
  }

  const existing = await db.refund.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    return { refundId: existing.id, status: existing.status };
  }

  const anchorPayment = booking.payments[0];
  if (!anchorPayment) {
    throw ApiError.conflict('NO_PAYMENT', 'No verified payment to refund');
  }

  const refund = await db.refund.create({
    data: {
      bookingId: booking.id,
      paymentId: anchorPayment.id,
      amount,
      currency: booking.currency,
      status: 'PENDING',
      reason: input.reason?.slice(0, 500) ?? null,
      idempotencyKey: input.idempotencyKey,
    },
  });

  void audit({
    actorId: input.actorId,
    action: AUDIT_ACTIONS.refundIssued,
    entityType: 'booking',
    entityId: booking.id,
    metadata: { reference: booking.reference, amount, reason: input.reason },
  });

  const adapter = getPaymentAdapter(anchorPayment.provider);
  if (!adapter.isConfigured()) {
    return {
      refundId: refund.id,
      status: 'PENDING',
      message: 'No payment provider configured — refund recorded for manual processing.',
    };
  }

  const result = await adapter.refundPayment({
    payment: anchorPayment,
    amount: refund.amount,
    reason: input.reason,
    idempotencyKey: input.idempotencyKey,
  });

  if (result.status === 'failed') {
    await db.refund.update({
      where: { id: refund.id },
      data: { status: 'FAILED', reason: result.message ?? input.reason ?? null },
    });
    return { refundId: refund.id, status: 'FAILED', message: result.message };
  }

  if (result.status === 'succeeded' && result.externalRefundId) {
    await db.refund.update({
      where: { id: refund.id },
      data: { externalId: result.externalRefundId },
    });
  }

  void notify(booking.customerId, 'booking.cancelled', {
    ref: booking.reference,
    reason: 'refund_issued',
  });

  return {
    refundId: refund.id,
    status: 'PENDING',
    message: result.status === 'not_supported' ? result.message : undefined,
  };
}
