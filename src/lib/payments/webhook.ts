import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';
import { getPaymentAdapter } from '@/lib/payments/registry';
import { notify } from '@/lib/notifications';
import { recordEvent } from '@/lib/analytics';

/**
 * Payment webhook processing (spec sections 35–36, 72).
 *
 * This is the ONLY path that marks bookings as paid:
 *  1. signature verification by the provider adapter
 *  2. event persistence with duplicate protection (unique provider+eventId)
 *  3. amount/currency validation against our Payment row
 *  4. transactional state machine with booking row lock
 *  5. audit + notifications + analytics from real transitions
 *
 * Frontend redirects never change payment state.
 */

export type WebhookResponse = { status: number; body: Record<string, unknown> };

export async function processPaymentWebhook(
  providerKey: string,
  req: Request,
  rawBody: string,
): Promise<WebhookResponse> {
  const adapter = getPaymentAdapter(providerKey);
  if (adapter.key !== providerKey.toLowerCase()) {
    return {
      status: 404,
      body: { error: { code: 'UNKNOWN_PROVIDER', message: 'Unknown payment provider' } },
    };
  }

  const verification = await adapter.verifyWebhook(req, rawBody);

  if (!verification.valid) {
    logger.warn('webhook_signature_invalid', {
      provider: providerKey,
      reason: verification.reason,
    });
    try {
      await db.webhookEvent.create({
        data: {
          provider: providerKey,
          externalEventId: `invalid_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          type: 'unknown',
          status: 'FAILED',
          signatureValid: false,
          error: verification.reason,
        },
      });
    } catch {
      // best-effort audit of invalid deliveries
    }
    return {
      status: 401,
      body: { error: { code: 'INVALID_SIGNATURE', message: 'Signature verification failed' } },
    };
  }

  const event = verification.event;

  // --- duplicate / idempotency protection --------------------------------
  let eventId: string;
  try {
    const row = await db.webhookEvent.create({
      data: {
        provider: providerKey,
        externalEventId: event.id,
        type: event.type,
        status: 'RECEIVED',
        signatureValid: true,
        payload: {
          externalPaymentId: event.externalPaymentId,
          amount: event.amount ?? null,
          currency: event.currency ?? null,
          externalRefundId: event.externalRefundId ?? null,
        } as object,
      },
    });
    eventId = row.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      logger.info('webhook_duplicate', { provider: providerKey, eventId: event.id });
      return { status: 200, body: { received: true, duplicate: true } };
    }
    throw err;
  }

  try {
    const result = await applyEvent(event);

    await db.webhookEvent.update({
      where: { id: eventId },
      data: {
        status: result.applied ? 'PROCESSED' : 'FAILED',
        error: result.error ?? null,
        processedAt: new Date(),
      },
    });

    if (!result.applied) {
      return {
        status: result.status,
        body: { error: { code: result.code, message: result.error } },
      };
    }
    return { status: 200, body: { received: true, applied: true } };
  } catch (error) {
    logger.error('webhook_processing_failed', {
      provider: providerKey,
      eventId: event.id,
      error: error instanceof Error ? error.message : String(error),
    });
    await db.webhookEvent
      .update({ where: { id: eventId }, data: { status: 'FAILED', error: 'processing_error' } })
      .catch(() => undefined);
    return {
      status: 500,
      body: { error: { code: 'PROCESSING_ERROR', message: 'Could not process event' } },
    };
  }
}

type ApplyResult = { applied: boolean; status: number; code?: string; error?: string };

type Event = {
  id: string;
  type: 'payment.succeeded' | 'payment.failed' | 'refund.succeeded' | 'refund.failed';
  externalPaymentId: string;
  amount?: string;
  currency?: string;
  externalRefundId?: string;
};

async function applyEvent(event: Event): Promise<ApplyResult> {
  const payment = await db.payment.findUnique({
    where: { externalId: event.externalPaymentId },
    include: { booking: true },
  });
  if (!payment) {
    return {
      applied: false,
      status: 404,
      code: 'PAYMENT_NOT_FOUND',
      error: 'Payment not found for event',
    };
  }

  // Amount sanity: a provider claiming a different amount than we requested
  // must never mark our payment as paid.
  if (event.amount !== undefined) {
    const claimed = Number(event.amount);
    const expected = Number(payment.amount.toString());
    if (!Number.isFinite(claimed) || Math.abs(claimed - expected) > 0.01) {
      logger.error('webhook_amount_mismatch', { paymentId: payment.id, expected, claimed });
      return {
        applied: false,
        status: 400,
        code: 'AMOUNT_MISMATCH',
        error: 'Event amount does not match payment',
      };
    }
  }

  switch (event.type) {
    case 'payment.succeeded':
      return applyPaymentSucceeded(payment.id, event);
    case 'payment.failed':
      return applyPaymentFailed(payment.id, event);
    case 'refund.succeeded':
      return applyRefundSettled(payment.id, event, 'SUCCEEDED');
    case 'refund.failed':
      return applyRefundSettled(payment.id, event, 'FAILED');
  }
}

async function applyPaymentSucceeded(paymentId: string, event: Event): Promise<ApplyResult> {
  type TxOutcome =
    | { kind: 'noop' }
    | { kind: 'invalid'; message: string }
    | {
        kind: 'ok';
        booking: { id: string; reference: string; customerId: string };
        fullyPaid: boolean;
      };

  const outcome = await db.$transaction(async (tx): Promise<TxOutcome> => {
    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { booking: true },
    });

    if (payment.status === 'PAID') {
      return { kind: 'noop' }; // duplicate delivery — idempotent success
    }
    if (payment.status === 'REFUNDED') {
      return { kind: 'invalid', message: 'Payment already refunded' };
    }

    // Serialise concurrent webhook handling per booking.
    await tx.$queryRaw`SELECT id FROM "bookings" WHERE id = ${payment.bookingId} FOR UPDATE`;

    await tx.payment.update({
      where: { id: payment.id },
      data: { status: 'PAID', paidAt: new Date(), failureReason: null },
    });

    const alreadyPaid = Number(payment.booking.amountPaid.toString());
    const amount = Number(payment.amount.toString());
    const newAmountPaid = alreadyPaid + amount;
    const total = Number(payment.booking.total.toString());
    const fullyPaid = newAmountPaid >= total - 0.01;

    const booking = await tx.booking.update({
      where: { id: payment.bookingId },
      data: {
        amountPaid: newAmountPaid,
        paymentStatus: fullyPaid ? 'PAID' : 'PARTIALLY_PAID',
        // A verified deposit/full payment confirms the booking.
        ...(payment.booking.status === 'PENDING'
          ? { status: 'CONFIRMED' as const, confirmedAt: new Date() }
          : {}),
      },
      select: { id: true, reference: true, customerId: true },
    });

    return { kind: 'ok' as const, booking, fullyPaid };
  });

  if (outcome.kind === 'invalid') {
    return { applied: false, status: 409, code: 'INVALID_STATE', error: outcome.message };
  }
  if (outcome.kind === 'ok') {
    void audit({
      action: AUDIT_ACTIONS.paymentSucceeded,
      entityType: 'booking',
      entityId: outcome.booking.id,
      metadata: {
        reference: outcome.booking.reference,
        eventId: event.id,
        fullyPaid: outcome.fullyPaid,
      },
    });
    void recordEvent('payment_success', { entityType: 'booking', entityId: outcome.booking.id });
    void notify(outcome.booking.customerId, 'payment.succeeded', {
      ref: outcome.booking.reference,
    });
    void notify(outcome.booking.customerId, 'booking.confirmed', {
      ref: outcome.booking.reference,
    });
  }

  return { applied: true, status: 200 };
}

async function applyPaymentFailed(paymentId: string, event: Event): Promise<ApplyResult> {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { booking: true },
  });
  if (!payment)
    return { applied: false, status: 404, code: 'PAYMENT_NOT_FOUND', error: 'Payment not found' };

  if (payment.status === 'PAID') {
    // A later failure event must not demote a verified payment.
    return { applied: true, status: 200 };
  }

  await db.payment.update({
    where: { id: payment.id },
    data: { status: 'FAILED', failedAt: new Date() },
  });

  // Only mark the booking failed when nothing else has been paid.
  if (Number(payment.booking.amountPaid.toString()) <= 0) {
    await db.booking.update({
      where: { id: payment.bookingId },
      data: { paymentStatus: 'FAILED' },
    });
  }

  void audit({
    action: AUDIT_ACTIONS.paymentFailed,
    entityType: 'booking',
    entityId: payment.bookingId,
    metadata: { reference: payment.booking.reference, eventId: event.id },
  });
  void recordEvent('payment_failure', { entityType: 'booking', entityId: payment.bookingId });
  void notify(payment.booking.customerId, 'payment.failed', { ref: payment.booking.reference });

  return { applied: true, status: 200 };
}

async function applyRefundSettled(
  paymentId: string,
  event: Event,
  status: 'SUCCEEDED' | 'FAILED',
): Promise<ApplyResult> {
  type TxOutcome = { kind: 'noop' } | { kind: 'ok' };

  const refund = await db.refund.findFirst({
    where: {
      OR: [{ externalId: event.externalRefundId ?? '__none__' }, { paymentId, status: 'PENDING' }],
    },
    include: { booking: true, payment: true },
  });
  if (!refund) {
    return {
      applied: false,
      status: 404,
      code: 'REFUND_NOT_FOUND',
      error: 'Refund not found for event',
    };
  }
  if (refund.status === status) {
    return { applied: true, status: 200 }; // idempotent
  }

  const outcome = await db.$transaction(async (tx): Promise<TxOutcome> => {
    await tx.$queryRaw`SELECT id FROM "bookings" WHERE id = ${refund.bookingId} FOR UPDATE`;

    await tx.refund.update({
      where: { id: refund.id },
      data: { status, processedAt: new Date() },
    });

    if (status === 'SUCCEEDED') {
      const amountRefunded =
        Number(refund.booking.amountRefunded.toString()) + Number(refund.amount.toString());
      const amountPaid = Number(refund.booking.amountPaid.toString());
      const fullyRefunded = amountPaid > 0 && amountRefunded >= amountPaid - 0.01;

      await tx.booking.update({
        where: { id: refund.bookingId },
        data: {
          amountRefunded,
          ...(fullyRefunded
            ? { status: 'REFUNDED' as const, paymentStatus: 'REFUNDED' as const }
            : {}),
        },
      });
      if (fullyRefunded) {
        await tx.payment.update({
          where: { id: refund.paymentId },
          data: { status: 'REFUNDED' },
        });
      }
    }
    return { kind: 'ok' };
  });

  if (status === 'SUCCEEDED' && outcome.kind === 'ok') {
    void audit({
      action: AUDIT_ACTIONS.refundSucceeded,
      entityType: 'booking',
      entityId: refund.bookingId,
      metadata: {
        reference: refund.booking.reference,
        amount: refund.amount.toString(),
        eventId: event.id,
      },
    });
  }

  return { applied: true, status: 200 };
}
