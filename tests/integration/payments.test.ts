import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { ApiError } from '@/lib/api/errors';
import { addDays, toDateString, todayUtc } from '@/lib/booking/dates';
import { createBooking, cancelBooking, type BookingRequest } from '@/lib/booking/service';
import { initiatePayment, issueRefund } from '@/lib/payments/service';
import { processPaymentWebhook, type WebhookResponse } from '@/lib/payments/webhook';
import { MOCK_SIGNATURE_HEADER, signMockPayload } from '@/lib/payments/providers/mock';

/**
 * Payment state machine integration tests — visit_imedwan_test.
 *
 * Invariants covered (spec sections 34–36, 72):
 * - PAID status happens ONLY through a signature-verified webhook
 * - duplicate deliveries are idempotent (event + payment level)
 * - amount mismatch fails closed (400, no state change)
 * - failure events never demote a verified payment; success recovers a failed one
 * - deposit → PARTIALLY_PAID → balance → PAID lifecycle
 * - refunds are idempotent and settle only via refund.succeeded
 * - initiatePayment is IDOR-safe and refuses closed/paid bookings
 */

const SUFFIX = Date.now().toString(36);
const OWNER_EMAIL = `owner-${SUFFIX}@payments.test`;
const CUSTOMER_EMAIL = `customer-${SUFFIX}@payments.test`;
const TOTAL = '1500'; // 3 nights × 500 MAD

let ownerId = '';
let customerId = '';
let stayBookableId = '';
const bookingIds: Record<'a' | 'b' | 'c' | 'd', string> = { a: '', b: '', c: '', d: '' };

function win(offset: number, nights = 3): { startDate: string; endDate: string } {
  return {
    startDate: toDateString(addDays(todayUtc(), offset)),
    endDate: toDateString(addDays(todayUtc(), offset + nights)),
  };
}

async function expectApiError(
  promise: Promise<unknown>,
  status: number,
  code: string,
): Promise<ApiError> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, `expected ApiError ${status}/${code}`).toBeInstanceOf(ApiError);
  const apiErr = err as ApiError;
  expect(apiErr.status).toBe(status);
  expect(apiErr.code).toBe(code);
  return apiErr;
}

let evtSeq = 0;
const evtId = () => `evt-${SUFFIX}-${++evtSeq}`;

/** Deliver a signed webhook to the mock provider (as the route would). */
async function deliver(
  body: Record<string, unknown>,
  opts: { secret?: string; provider?: string } = {},
): Promise<WebhookResponse> {
  const raw = JSON.stringify(body);
  const req = new Request('http://localhost/api/v1/payments/webhook/mock', {
    method: 'POST',
    headers: {
      [MOCK_SIGNATURE_HEADER]: signMockPayload(raw, opts.secret ?? env.paymentWebhookSecret),
      'content-type': 'application/json',
    },
    body: raw,
  });
  return processPaymentWebhook(opts.provider ?? 'mock', req, raw);
}

const externalIdOf = async (paymentId: string): Promise<string> => {
  const row = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  expect(row.externalId).not.toBeNull();
  return row.externalId as string;
};

const paymentRow = (id: string) => db.payment.findUniqueOrThrow({ where: { id } });
const bookingRow = (id: string) => db.booking.findUniqueOrThrow({ where: { id } });

beforeAll(async () => {
  const owner = await db.user.create({
    data: { email: OWNER_EMAIL, passwordHash: 'x', role: 'BUSINESS_OWNER', locale: 'en' },
  });
  const customer = await db.user.create({
    data: { email: CUSTOMER_EMAIL, passwordHash: 'x', role: 'CUSTOMER', locale: 'en' },
  });
  ownerId = owner.id;
  customerId = customer.id;

  const business = await db.business.create({
    data: {
      ownerId,
      type: 'ACCOMMODATION',
      slug: `pay-stay-${SUFFIX}`,
      name: `Pay Stay ${SUFFIX}`,
      status: 'PUBLISHED',
      email: OWNER_EMAIL,
    },
  });
  const accommodation = await db.accommodation.create({ data: { businessId: business.id } });
  const bookable = await db.bookable.create({
    data: {
      category: 'ACCOMMODATION',
      businessId: business.id,
      slug: `pay-unit-${SUFFIX}`,
      capacity: 3,
      status: 'PUBLISHED',
    },
  });
  stayBookableId = bookable.id;
  await db.accommodationUnit.create({
    data: {
      accommodationId: accommodation.id,
      bookableId: bookable.id,
      name: `Pay Room ${SUFFIX}`,
      capacity: 3,
    },
  });
  await db.price.create({
    data: { bookableId: bookable.id, unit: 'NIGHT', amount: 500, currency: 'MAD' },
  });
  await db.availabilityRule.create({
    data: {
      bookableId: bookable.id,
      startDate: new Date(Date.UTC(2020, 0, 1)),
      capacity: 1,
    },
  });

  const makeBooking = async (offset: number): Promise<string> => {
    const { booking } = await createBooking({
      customerId,
      customerEmail: CUSTOMER_EMAIL,
      request: {
        bookableId: stayBookableId,
        guests: 1,
        ...win(offset),
      } satisfies BookingRequest,
    });
    return booking.id;
  };
  bookingIds.a = await makeBooking(10);
  bookingIds.b = await makeBooking(20);
  bookingIds.c = await makeBooking(30);
  bookingIds.d = await makeBooking(40);
});

afterAll(async () => {
  // Let fire-and-forget audit/notification writes settle.
  await new Promise((resolve) => setTimeout(resolve, 500));
  const users = await db.user.findMany({
    where: { email: { endsWith: '@payments.test' } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  // Delete in FK-safe order (webhook events → refunds → payments → bookings).
  await db.webhookEvent.deleteMany({});
  await db.refund.deleteMany({
    where: { booking: { customerEmail: { endsWith: '@payments.test' } } },
  });
  await db.payment.deleteMany({
    where: { booking: { customerEmail: { endsWith: '@payments.test' } } },
  });
  await db.booking.deleteMany({ where: { customerEmail: { endsWith: '@payments.test' } } });
  if (ids.length > 0) {
    await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    const businesses = await db.business.findMany({
      where: { ownerId: { in: ids } },
      select: { id: true },
    });
    await db.business.deleteMany({
      where: { id: { in: businesses.map((b) => b.id) } },
    });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  }
  await db.$disconnect();
});

describe('initiatePayment', () => {
  it('creates an UNPAID row and a signed mock checkout (FULL)', async () => {
    const result = await initiatePayment({
      bookingId: bookingIds.a,
      customerId,
      mode: 'FULL',
      idempotencyKey: `payA-${SUFFIX}`,
    });

    expect(result.status).toBe('requires_action');
    expect(result.amount).toBe(TOTAL);
    expect(result.currency).toBe('MAD');
    expect(result.mode).toBe('FULL');
    expect(result.checkoutUrl).toContain('/api/v1/payments/mock/checkout?paymentId=');

    const row = await paymentRow(result.paymentId);
    expect(row.status).toBe('UNPAID');
    expect(row.provider).toBe('mock');
    expect(row.externalId?.startsWith('mockpay_')).toBe(true);
    expect(row.amount.toString()).toBe(TOTAL);
  });

  it('replays the same idempotency key without creating a second payment', async () => {
    const first = await initiatePayment({
      bookingId: bookingIds.a,
      customerId,
      mode: 'FULL',
      idempotencyKey: `payA-${SUFFIX}`,
    });
    const count = await db.payment.count({ where: { idempotencyKey: `payA-${SUFFIX}` } });
    expect(count).toBe(1);
    expect(await db.payment.count({ where: { bookingId: bookingIds.a } })).toBe(1);
    expect(first.status).toBe('requires_action');
  });

  it('is IDOR-safe and refuses deposit when not configured', async () => {
    await expectApiError(
      initiatePayment({
        bookingId: bookingIds.a,
        customerId: 'someone-else-id',
        mode: 'FULL',
      }),
      404,
      'NOT_FOUND',
    );
    await expectApiError(
      initiatePayment({
        bookingId: bookingIds.b,
        customerId,
        mode: 'DEPOSIT',
        idempotencyKey: `payBdep-${SUFFIX}`,
      }),
      400,
      'DEPOSIT_NOT_AVAILABLE',
    );
  });
});

describe('signed webhook processing', () => {
  let paymentAId = '';
  let paymentBId = '';
  let firstEventId = '';

  it('payment.succeeded is the only path to PAID (confirms the booking)', async () => {
    paymentAId = (
      await db.payment.findUniqueOrThrow({ where: { idempotencyKey: `payA-${SUFFIX}` } })
    ).id;
    const externalId = await externalIdOf(paymentAId);

    firstEventId = evtId();
    const res = await deliver({
      id: firstEventId,
      type: 'payment.succeeded',
      externalPaymentId: externalId,
      amount: TOTAL,
      currency: 'MAD',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true, applied: true });

    const payment = await paymentRow(paymentAId);
    expect(payment.status).toBe('PAID');
    expect(payment.paidAt).not.toBeNull();

    const booking = await bookingRow(bookingIds.a);
    expect(booking.amountPaid.toString()).toBe(TOTAL);
    expect(booking.paymentStatus).toBe('PAID');
    expect(booking.status).toBe('CONFIRMED');
    expect(booking.confirmedAt).not.toBeNull();

    const events = await db.webhookEvent.findMany({
      where: { provider: 'mock', externalEventId: { contains: SUFFIX } },
    });
    expect(events.length).toBe(evtSeq);
    for (const e of events) {
      expect(e.signatureValid).toBe(true);
      expect(e.status).toBe('PROCESSED');
    }
  });

  it('duplicate deliveries never double-count', async () => {
    const externalId = await externalIdOf(paymentAId);

    // Exact same event id → event-level dedup (unique provider+eventId).
    const replay = await deliver({
      id: firstEventId,
      type: 'payment.succeeded',
      externalPaymentId: externalId,
      amount: TOTAL,
      currency: 'MAD',
    });
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({ received: true, duplicate: true });
    expect(
      await db.webhookEvent.count({
        where: { provider: 'mock', externalEventId: firstEventId },
      }),
    ).toBe(1); // stored exactly once

    // A NEW event id for an already-paid payment is a no-op, not a re-apply.
    const noop = await deliver({
      id: evtId(),
      type: 'payment.succeeded',
      externalPaymentId: externalId,
      amount: TOTAL,
      currency: 'MAD',
    });
    expect(noop.status).toBe(200);
    expect(noop.body).toMatchObject({ received: true, applied: true });

    const booking = await bookingRow(bookingIds.a);
    expect(booking.amountPaid.toString()).toBe(TOTAL); // still exactly one payment counted
  });

  it('refuses to pay an already fully paid booking', async () => {
    await expectApiError(
      initiatePayment({
        bookingId: bookingIds.a,
        customerId,
        mode: 'FULL',
        idempotencyKey: `payA2-${SUFFIX}`,
      }),
      409,
      'ALREADY_PAID',
    );
  });

  it('rejects a bad signature with 401 and touches nothing', async () => {
    const result = await initiatePayment({
      bookingId: bookingIds.b,
      customerId,
      mode: 'FULL',
      idempotencyKey: `payB-${SUFFIX}`,
    });
    paymentBId = result.paymentId;
    const externalId = await externalIdOf(result.paymentId);

    const res = await deliver(
      {
        id: evtId(),
        type: 'payment.succeeded',
        externalPaymentId: externalId,
        amount: TOTAL,
        currency: 'MAD',
      },
      { secret: 'an-entirely-different-secret' },
    );
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: { code: 'INVALID_SIGNATURE' } });

    expect((await paymentRow(result.paymentId)).status).toBe('UNPAID');
    const booking = await bookingRow(bookingIds.b);
    expect(booking.paymentStatus).toBe('UNPAID');
    expect(booking.status).toBe('PENDING');

    const failed = await db.webhookEvent.findFirst({
      where: { status: 'FAILED', signatureValid: false },
    });
    expect(failed).not.toBeNull();
    expect(failed?.error).toBeTruthy();
  });

  it('fails closed on amount mismatch (400, payment stays UNPAID)', async () => {
    const externalId = await externalIdOf(paymentBId);

    const res = await deliver({
      id: evtId(),
      type: 'payment.succeeded',
      externalPaymentId: externalId,
      amount: '1', // provider claims 1 MAD for a 1500 MAD payment
      currency: 'MAD',
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'AMOUNT_MISMATCH' } });

    expect((await paymentRow(paymentBId)).status).toBe('UNPAID');
    expect((await bookingRow(bookingIds.b)).paymentStatus).toBe('UNPAID');

    const event = await db.webhookEvent.findFirst({
      where: {
        externalEventId: { contains: `${SUFFIX}` },
        status: 'FAILED',
        error: 'Event amount does not match payment',
      },
    });
    expect(event).not.toBeNull();
  });

  it('answers 404 for unknown payments and unknown providers', async () => {
    const unknownPayment = await deliver({
      id: evtId(),
      type: 'payment.succeeded',
      externalPaymentId: 'mockpay_does-not-exist',
      amount: '100',
      currency: 'MAD',
    });
    expect(unknownPayment.status).toBe(404);
    expect(unknownPayment.body).toMatchObject({ error: { code: 'PAYMENT_NOT_FOUND' } });

    const unknownProvider = await deliver(
      { id: evtId(), type: 'payment.succeeded', externalPaymentId: 'x' },
      { provider: 'stripe' },
    );
    expect(unknownProvider.status).toBe(404);
    expect(unknownProvider.body).toMatchObject({ error: { code: 'UNKNOWN_PROVIDER' } });
  });

  it('cannot pay a cancelled booking', async () => {
    const cancelled = await cancelBooking({
      bookingId: bookingIds.b,
      actorId: customerId,
      reason: 'changed my mind',
    });
    expect(cancelled.status).toBe('CANCELLED');

    await expectApiError(
      initiatePayment({
        bookingId: bookingIds.b,
        customerId,
        mode: 'FULL',
        idempotencyKey: `payB2-${SUFFIX}`,
      }),
      409,
      'BOOKING_CLOSED',
    );
  });
});

describe('failure and recovery', () => {
  let paymentCId = '';

  it('payment.failed marks the payment FAILED and the booking unpaid-failed', async () => {
    const result = await initiatePayment({
      bookingId: bookingIds.c,
      customerId,
      mode: 'FULL',
      idempotencyKey: `payC-${SUFFIX}`,
    });
    paymentCId = result.paymentId;

    const res = await deliver({
      id: evtId(),
      type: 'payment.failed',
      externalPaymentId: await externalIdOf(result.paymentId),
      amount: TOTAL,
      currency: 'MAD',
    });
    expect(res.status).toBe(200);

    const payment = await paymentRow(paymentCId);
    expect(payment.status).toBe('FAILED');
    expect(payment.failedAt).not.toBeNull();

    const booking = await bookingRow(bookingIds.c);
    expect(booking.paymentStatus).toBe('FAILED');
    expect(booking.status).toBe('PENDING'); // failure never confirms nor cancels
  });

  it('a later success event recovers a failed payment', async () => {
    const res = await deliver({
      id: evtId(),
      type: 'payment.succeeded',
      externalPaymentId: await externalIdOf(paymentCId),
      amount: TOTAL,
      currency: 'MAD',
    });
    expect(res.status).toBe(200);

    const payment = await paymentRow(paymentCId);
    expect(payment.status).toBe('PAID');
    const booking = await bookingRow(bookingIds.c);
    expect(booking.paymentStatus).toBe('PAID');
    expect(booking.status).toBe('CONFIRMED');
  });

  it('a late failure event never demotes a verified payment', async () => {
    const res = await deliver({
      id: evtId(),
      type: 'payment.failed',
      externalPaymentId: await externalIdOf(paymentCId),
      amount: TOTAL,
      currency: 'MAD',
    });
    expect(res.status).toBe(200);
    expect((await paymentRow(paymentCId)).status).toBe('PAID');
    expect((await bookingRow(bookingIds.c)).paymentStatus).toBe('PAID');
  });
});

describe('deposit lifecycle', () => {
  it('deposit → PARTIALLY_PAID → balance → PAID', async () => {
    // Enable a 500 MAD deposit on booking D (server-side setting on the row).
    await db.booking.update({
      where: { id: bookingIds.d },
      data: { depositEnabled: true, depositAmount: 500 },
    });

    const deposit = await initiatePayment({
      bookingId: bookingIds.d,
      customerId,
      mode: 'DEPOSIT',
      idempotencyKey: `payDdep-${SUFFIX}`,
    });
    expect(deposit.status).toBe('requires_action');
    expect(deposit.amount).toBe('500');
    expect(deposit.mode).toBe('DEPOSIT');

    const d1 = await deliver({
      id: evtId(),
      type: 'payment.succeeded',
      externalPaymentId: await externalIdOf(deposit.paymentId),
      amount: '500',
      currency: 'MAD',
    });
    expect(d1.status).toBe(200);

    let booking = await bookingRow(bookingIds.d);
    expect(booking.amountPaid.toString()).toBe('500');
    expect(booking.paymentStatus).toBe('PARTIALLY_PAID');
    expect(booking.status).toBe('CONFIRMED'); // a verified deposit confirms

    const balance = await initiatePayment({
      bookingId: bookingIds.d,
      customerId,
      mode: 'FULL',
      idempotencyKey: `payDfull-${SUFFIX}`,
    });
    expect(balance.amount).toBe('1000'); // outstanding = 1500 − 500

    const d2 = await deliver({
      id: evtId(),
      type: 'payment.succeeded',
      externalPaymentId: await externalIdOf(balance.paymentId),
      amount: '1000',
      currency: 'MAD',
    });
    expect(d2.status).toBe(200);

    booking = await bookingRow(bookingIds.d);
    expect(booking.amountPaid.toString()).toBe(TOTAL);
    expect(booking.paymentStatus).toBe('PAID');

    await expectApiError(
      initiatePayment({
        bookingId: bookingIds.d,
        customerId,
        mode: 'FULL',
        idempotencyKey: `payD2-${SUFFIX}`,
      }),
      409,
      'ALREADY_PAID',
    );
  });
});

describe('refunds', () => {
  it('issues idempotent refunds that settle only via refund.succeeded', async () => {
    // Partial refund attempt that ultimately fails at the provider.
    const partial = await issueRefund({
      bookingId: bookingIds.a,
      actorId: ownerId,
      amount: 300,
      reason: 'test partial',
      idempotencyKey: `refA1-${SUFFIX}`,
    });
    expect(partial.status).toBe('PENDING');

    const replay = await issueRefund({
      bookingId: bookingIds.a,
      actorId: ownerId,
      amount: 300,
      idempotencyKey: `refA1-${SUFFIX}`,
    });
    expect(replay.refundId).toBe(partial.refundId);
    expect(await db.refund.count({ where: { idempotencyKey: `refA1-${SUFFIX}` } })).toBe(1);

    const refundRow = await db.refund.findUniqueOrThrow({ where: { id: partial.refundId } });
    expect(refundRow.externalId?.startsWith('mockref_')).toBe(true);

    const failed = await deliver({
      id: evtId(),
      type: 'refund.failed',
      externalPaymentId: await externalIdOf(
        (
          await db.payment.findFirstOrThrow({
            where: { bookingId: bookingIds.a, status: 'PAID' },
          })
        ).id,
      ),
      externalRefundId: refundRow.externalId,
    });
    expect(failed.status).toBe(200);
    expect((await db.refund.findUniqueOrThrow({ where: { id: partial.refundId } })).status).toBe(
      'FAILED',
    );

    let booking = await bookingRow(bookingIds.a);
    expect(booking.amountRefunded.toString()).toBe('0');
    expect(booking.paymentStatus).toBe('PAID'); // failed refund changes nothing

    // Full refund settles → booking REFUNDED end-to-end.
    const full = await issueRefund({
      bookingId: bookingIds.a,
      actorId: ownerId,
      reason: 'test full',
      idempotencyKey: `refA2-${SUFFIX}`,
    });
    expect(full.status).toBe('PENDING');
    const fullRow = await db.refund.findUniqueOrThrow({ where: { id: full.refundId } });

    const settle = await deliver({
      id: evtId(),
      type: 'refund.succeeded',
      externalPaymentId: await externalIdOf(
        (
          await db.payment.findFirstOrThrow({
            where: { bookingId: bookingIds.a, status: 'PAID' },
          })
        ).id,
      ),
      externalRefundId: fullRow.externalId,
      amount: TOTAL,
      currency: 'MAD',
    });
    expect(settle.status).toBe(200);

    expect((await db.refund.findUniqueOrThrow({ where: { id: full.refundId } })).status).toBe(
      'SUCCEEDED',
    );
    booking = await bookingRow(bookingIds.a);
    expect(booking.amountRefunded.toString()).toBe(TOTAL);
    expect(booking.status).toBe('REFUNDED');
    expect(booking.paymentStatus).toBe('REFUNDED');

    const settledPayment = await db.payment.findFirstOrThrow({
      where: { bookingId: bookingIds.a },
    });
    expect(settledPayment.status).toBe('REFUNDED');
  });

  it('nothing left to refund after settlement', async () => {
    await expectApiError(
      issueRefund({
        bookingId: bookingIds.a,
        actorId: ownerId,
        idempotencyKey: `refA3-${SUFFIX}`,
      }),
      409,
      'NOTHING_TO_REFUND',
    );
    // An unpaid booking has nothing to refund either.
    await expectApiError(
      issueRefund({
        bookingId: bookingIds.b,
        actorId: ownerId,
        idempotencyKey: `refB-${SUFFIX}`,
      }),
      409,
      'NOTHING_TO_REFUND',
    );
  });
});
