import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { ApiError } from '@/lib/api/errors';
import { addDays, parseDateOnly, todayUtc, toDateString } from '@/lib/booking/dates';
import {
  cancelBooking,
  createBooking,
  expireStaleBookings,
  generateReference,
  markBookingCompleted,
  quoteBooking,
  type BookingRequest,
} from '@/lib/booking/service';

/**
 * Booking engine integration tests — visit_imedwan_test.
 *
 * Invariants covered (spec sections 36–38):
 * - server-side pricing end-to-end (client never supplies an amount)
 * - availability never fabricated (0 capacity without a rule)
 * - blocks zero the calendar; cancelled/expired bookings free inventory
 * - FOR UPDATE row lock: concurrent bookings cannot double-sell
 * - idempotency keys are single-customer and replay-safe
 * - state machine: PENDING → CANCELLED/COMPLETED guards
 */

const SUFFIX = Date.now().toString(36);
const TEST_EMAIL = `owner-${SUFFIX}@booking.test`;
const CUSTOMER = `customer-${SUFFIX}@booking.test`;
const CUSTOMER2 = `customer2-${SUFFIX}@booking.test`;

/** date window helper: offsets are days from today (UTC). */
function win(offset: number, nights = 3): { startDate: string; endDate: string } {
  return {
    startDate: toDateString(addDays(todayUtc(), offset)),
    endDate: toDateString(addDays(todayUtc(), offset + nights)),
  };
}

type Fixtures = {
  customerA: string;
  customerB: string;
  stayBookableId: string;
  stayUnitCapacity: number;
  guideBookableId: string;
};

const fx: Fixtures = {
  customerA: '',
  customerB: '',
  stayBookableId: '',
  stayUnitCapacity: 3,
  guideBookableId: '',
};

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

function baseRequest(over: Partial<BookingRequest> & { bookableId: string }): BookingRequest {
  return { guests: 1, ...win(20), ...over };
}

beforeAll(async () => {
  const owner = await db.user.create({
    data: { email: TEST_EMAIL, passwordHash: 'x', role: 'BUSINESS_OWNER', locale: 'en' },
  });
  const customerA = await db.user.create({
    data: { email: CUSTOMER, passwordHash: 'x', role: 'CUSTOMER', locale: 'en' },
  });
  const customerB = await db.user.create({
    data: { email: CUSTOMER2, passwordHash: 'x', role: 'CUSTOMER', locale: 'en' },
  });
  fx.customerA = customerA.id;
  fx.customerB = customerB.id;

  // --- Accommodation fixture: published business, 1 unit, capacity 3 --------
  const stay = await db.business.create({
    data: {
      ownerId: owner.id,
      type: 'ACCOMMODATION',
      slug: `stay-${SUFFIX}`,
      name: `Test Stay ${SUFFIX}`,
      status: 'PUBLISHED',
      email: TEST_EMAIL,
    },
  });
  const accommodation = await db.accommodation.create({ data: { businessId: stay.id } });
  const stayBookable = await db.bookable.create({
    data: {
      category: 'ACCOMMODATION',
      businessId: stay.id,
      slug: `stay-unit-${SUFFIX}`,
      capacity: fx.stayUnitCapacity,
      status: 'PUBLISHED',
    },
  });
  fx.stayBookableId = stayBookable.id;
  await db.accommodationUnit.create({
    data: {
      accommodationId: accommodation.id,
      bookableId: stayBookable.id,
      name: `Room A ${SUFFIX}`,
      capacity: fx.stayUnitCapacity,
    },
  });
  await db.price.create({
    data: { bookableId: stayBookable.id, unit: 'NIGHT', amount: 450, currency: 'MAD' },
  });
  // Availability is never fabricated: without this rule capacity would be 0.
  await db.availabilityRule.create({
    data: {
      bookableId: stayBookable.id,
      startDate: new Date(Date.UTC(2020, 0, 1)),
      capacity: 1,
    },
  });

  // --- Guide fixture: capacity 4 participants, PERSON pricing ---------------
  const guideBiz = await db.business.create({
    data: {
      ownerId: owner.id,
      type: 'GUIDE',
      slug: `guide-${SUFFIX}`,
      name: `Test Guide ${SUFFIX}`,
      status: 'PUBLISHED',
      email: TEST_EMAIL,
    },
  });
  const guide = await db.guide.create({ data: { businessId: guideBiz.id } });
  const guideBookable = await db.bookable.create({
    data: {
      category: 'GUIDE',
      businessId: guideBiz.id,
      slug: `guide-svc-${SUFFIX}`,
      capacity: 4,
      status: 'PUBLISHED',
    },
  });
  fx.guideBookableId = guideBookable.id;
  await db.guideService.create({
    data: { guideId: guide.id, bookableId: guideBookable.id, name: `Hike ${SUFFIX}` },
  });
  await db.price.create({
    data: { bookableId: guideBookable.id, unit: 'PERSON', amount: 200, currency: 'MAD' },
  });
  await db.availabilityRule.create({
    data: {
      bookableId: guideBookable.id,
      startDate: new Date(Date.UTC(2020, 0, 1)),
      capacity: 4,
    },
  });
});

afterAll(async () => {
  // Let fire-and-forget audit/notification writes settle.
  await new Promise((resolve) => setTimeout(resolve, 500));
  const users = await db.user.findMany({
    where: { email: { endsWith: '@booking.test' } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  if (ids.length > 0) {
    await db.booking.deleteMany({ where: { customerEmail: { endsWith: '@booking.test' } } });
    const businesses = await db.business.findMany({
      where: { ownerId: { in: ids } },
      select: { id: true },
    });
    await db.business.deleteMany({ where: { id: { in: businesses.map((b) => b.id) } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  }
  await db.$disconnect();
});

describe('quoteBooking', () => {
  it('prices server-side: 3 nights × 450 MAD, no fabricated data', async () => {
    const quote = await quoteBooking(baseRequest({ bookableId: fx.stayBookableId, ...win(7, 3) }));

    expect(quote.bookable.category).toBe('ACCOMMODATION');
    expect(quote.nights).toBe(3);
    expect(quote.pricing.unit).toBe('NIGHT');
    expect(quote.pricing.unitPrice).toBe('450');
    expect(quote.pricing.quantity).toBe(3);
    expect(quote.pricing.subtotal).toBe('1350');
    expect(quote.total).toBe('1350');
    expect(quote.currency).toBe('MAD');
    expect(quote.availability.available).toBe(true);
    expect(quote.availability.unavailableDates).toEqual([]);
    expect(quote.holdMinutes).toBeGreaterThan(0);
    // Default commission/deposit settings: deposit disabled unless configured.
    expect(quote.deposit === null || quote.deposit.enabled).toBe(true);
  });

  it('rejects invalid requests without side effects', async () => {
    // Past start date.
    await expectApiError(
      quoteBooking(
        baseRequest({
          bookableId: fx.stayBookableId,
          startDate: toDateString(addDays(todayUtc(), -3)),
          endDate: toDateString(addDays(todayUtc(), 1)),
        }),
      ),
      400,
      'DATE_IN_PAST',
    );
    // Zero/negative nights for accommodation.
    const sameDay = toDateString(addDays(todayUtc(), 10));
    await expectApiError(
      quoteBooking(
        baseRequest({ bookableId: fx.stayBookableId, startDate: sameDay, endDate: sameDay }),
      ),
      400,
      'INVALID_DATE_RANGE',
    );
    // Guests above unit capacity.
    await expectApiError(
      quoteBooking(
        baseRequest({
          bookableId: fx.stayBookableId,
          guests: fx.stayUnitCapacity + 1,
          ...win(11),
        }),
      ),
      400,
      'GUESTS_EXCEED_CAPACITY',
    );
    // Zero guests.
    await expectApiError(
      quoteBooking(baseRequest({ bookableId: fx.stayBookableId, guests: 0, ...win(12) })),
      400,
      'INVALID_GUESTS',
    );
    // Unknown bookable.
    await expectApiError(quoteBooking(baseRequest({ bookableId: 'missing' })), 404, 'NOT_FOUND');
  });
});

describe('createBooking', () => {
  it('creates a PENDING booking with reference, hold window and item snapshot', async () => {
    const request = baseRequest({ bookableId: fx.stayBookableId, ...win(20, 3) });
    const { booking, idempotent } = await createBooking({
      customerId: fx.customerA,
      customerEmail: CUSTOMER,
      request,
    });

    expect(idempotent).toBe(false);
    expect(booking.reference).toMatch(/^VI-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(booking.status).toBe('PENDING');
    expect(booking.paymentStatus).toBe('UNPAID');
    expect(booking.total.toString()).toBe('1350');
    expect(booking.subtotal.toString()).toBe('1350');
    expect(booking.currency).toBe('MAD');
    expect(booking.holdExpiresAt).not.toBeNull();
    expect(booking.holdExpiresAt?.getTime() ?? 0).toBeGreaterThan(Date.now());

    const items = await db.bookingItem.findMany({ where: { bookingId: booking.id } });
    expect(items).toHaveLength(1);
    expect(items[0]?.quantity).toBe(3);
    expect(items[0]?.pricingUnit).toBe('NIGHT');
    expect(items[0]?.unitPrice.toString()).toBe('450');
  });

  it('prevents double-booking the same inventory (409), quote reports it', async () => {
    const overlap = baseRequest({ bookableId: fx.stayBookableId, ...win(20, 3) });

    await expectApiError(
      createBooking({
        customerId: fx.customerB,
        customerEmail: CUSTOMER2,
        request: overlap,
      }),
      409,
      'NOT_AVAILABLE',
    );

    const quote = await quoteBooking(overlap);
    expect(quote.availability.available).toBe(false);
    expect(quote.availability.unavailableDates.length).toBeGreaterThan(0);
  });

  it('serialises concurrent creators: exactly one wins', async () => {
    const window = win(80, 3);
    const attempts = [1, 2, 3].map((n) =>
      createBooking({
        customerId: fx.customerA,
        customerEmail: CUSTOMER,
        request: baseRequest({ bookableId: fx.stayBookableId, ...window }),
        idempotencyKey: `conc-${SUFFIX}-${n}`,
      }),
    );

    const results = await Promise.allSettled(attempts);
    const wins = results.filter((r) => r.status === 'fulfilled');
    const losses = results.filter((r) => r.status === 'rejected');

    expect(wins).toHaveLength(1);
    expect(losses).toHaveLength(2);
    for (const loss of losses) {
      const err = (loss as PromiseRejectedResult).reason;
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe('NOT_AVAILABLE');
    }

    const created = await db.booking.count({
      where: {
        startDate: parseDateOnly(window.startDate),
        endDate: parseDateOnly(window.endDate),
        customerEmail: CUSTOMER,
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
    });
    expect(created).toBe(1);
  });

  it('replays idempotency keys and refuses cross-customer reuse', async () => {
    const request = baseRequest({ bookableId: fx.stayBookableId, ...win(30, 3) });
    const key = `idem-${SUFFIX}-a`;

    const first = await createBooking({
      customerId: fx.customerA,
      customerEmail: CUSTOMER,
      request,
      idempotencyKey: key,
    });
    const replay = await createBooking({
      customerId: fx.customerA,
      customerEmail: CUSTOMER,
      request,
      idempotencyKey: key,
    });

    expect(first.idempotent).toBe(false);
    expect(replay.idempotent).toBe(true);
    expect(replay.booking.id).toBe(first.booking.id);

    // Another customer cannot reuse the key.
    await expectApiError(
      createBooking({
        customerId: fx.customerB,
        customerEmail: CUSTOMER2,
        request,
        idempotencyKey: key,
      }),
      403,
      'FORBIDDEN',
    );
  });

  it('refuses bookings when no availability rule covers the dates', async () => {
    // Rule-free bookable → capacity 0 (availability is never fabricated).
    const owner = await db.user.findFirst({ where: { email: TEST_EMAIL } });
    const bareBiz = await db.business.create({
      data: {
        ownerId: owner!.id,
        type: 'ACCOMMODATION',
        slug: `bare-${SUFFIX}`,
        name: `Bare ${SUFFIX}`,
        status: 'PUBLISHED',
      },
    });
    const bare = await db.bookable.create({
      data: {
        category: 'ACCOMMODATION',
        businessId: bareBiz.id,
        slug: `bare-unit-${SUFFIX}`,
        status: 'PUBLISHED',
      },
    });
    await db.accommodationUnit.create({
      data: {
        accommodationId: (await db.accommodation.create({ data: { businessId: bareBiz.id } })).id,
        bookableId: bare.id,
        name: `Bare room ${SUFFIX}`,
      },
    });
    await db.price.create({
      data: { bookableId: bare.id, unit: 'NIGHT', amount: 100, currency: 'MAD' },
    });

    const quote = await quoteBooking(baseRequest({ bookableId: bare.id, ...win(85, 2) }));
    expect(quote.availability.available).toBe(false);
    expect(quote.availability.unavailableDates).toHaveLength(2);

    await expectApiError(
      createBooking({
        customerId: fx.customerA,
        customerEmail: CUSTOMER,
        request: baseRequest({ bookableId: bare.id, ...win(85, 2) }),
      }),
      409,
      'NOT_AVAILABLE',
    );
  });

  it('GUIDE category charges per person and holds guest slots', async () => {
    const quote = await quoteBooking(
      baseRequest({ bookableId: fx.guideBookableId, guests: 3, ...win(90, 2) }),
    );
    expect(quote.pricing.unit).toBe('PERSON');
    expect(quote.pricing.quantity).toBe(3);
    expect(quote.pricing.subtotal).toBe('600'); // 3 × 200

    // 2 guests booked first …
    await createBooking({
      customerId: fx.customerA,
      customerEmail: CUSTOMER,
      request: baseRequest({ bookableId: fx.guideBookableId, guests: 2, ...win(90, 2) }),
    });
    // … then 3 more exceed the 4-participant capacity.
    await expectApiError(
      createBooking({
        customerId: fx.customerB,
        customerEmail: CUSTOMER2,
        request: baseRequest({ bookableId: fx.guideBookableId, guests: 3, ...win(90, 2) }),
      }),
      409,
      'NOT_AVAILABLE',
    );
    // Two more participants fit exactly (2 used + 2 = capacity 4).
    const fits = await createBooking({
      customerId: fx.customerB,
      customerEmail: CUSTOMER2,
      request: baseRequest({ bookableId: fx.guideBookableId, guests: 2, ...win(90, 2) }),
    });
    expect(fits.booking.status).toBe('PENDING');
  });
});

describe('blocks and lifecycle', () => {
  it('an availability block zeroes the window (quote + create both refuse)', async () => {
    const window = win(40, 3);
    const blocked = parseDateOnly(toDateString(addDays(todayUtc(), 38)));
    const unblock = parseDateOnly(toDateString(addDays(todayUtc(), 45)));
    const block = await db.availabilityBlock.create({
      data: { bookableId: fx.stayBookableId, startDate: blocked, endDate: unblock },
    });

    const quote = await quoteBooking(baseRequest({ bookableId: fx.stayBookableId, ...window }));
    expect(quote.availability.available).toBe(false);

    await expectApiError(
      createBooking({
        customerId: fx.customerA,
        customerEmail: CUSTOMER,
        request: baseRequest({ bookableId: fx.stayBookableId, ...window }),
      }),
      409,
      'NOT_AVAILABLE',
    );

    await db.availabilityBlock.delete({ where: { id: block.id } });

    // Block removed → the same window books fine again.
    const ok = await createBooking({
      customerId: fx.customerA,
      customerEmail: CUSTOMER,
      request: baseRequest({ bookableId: fx.stayBookableId, ...window }),
    });
    expect(ok.booking.status).toBe('PENDING');
  });

  it('cancellation frees inventory and refuses a second cancel', async () => {
    const window = win(50, 3);
    const { booking } = await createBooking({
      customerId: fx.customerA,
      customerEmail: CUSTOMER,
      request: baseRequest({ bookableId: fx.stayBookableId, ...window }),
    });

    const cancelled = await cancelBooking({
      bookingId: booking.id,
      actorId: fx.customerA,
      reason: 'plans changed',
    });
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancelledAt).not.toBeNull();
    expect(cancelled.cancelReason).toBe('plans changed');

    // Inventory is free again …
    const rebook = await createBooking({
      customerId: fx.customerB,
      customerEmail: CUSTOMER2,
      request: baseRequest({ bookableId: fx.stayBookableId, ...window }),
    });
    expect(rebook.booking.status).toBe('PENDING');

    // … but a cancelled booking cannot be cancelled or completed again.
    await expectApiError(
      cancelBooking({ bookingId: booking.id, actorId: fx.customerA }),
      409,
      'NOT_CANCELLABLE',
    );
    await expectApiError(
      markBookingCompleted({ bookingId: booking.id, actorId: fx.customerA }),
      409,
      'NOT_COMPLETABLE',
    );
  });

  it('completes PENDING/CONFIRMED bookings (enables reviews)', async () => {
    const { booking } = await createBooking({
      customerId: fx.customerA,
      customerEmail: CUSTOMER,
      request: baseRequest({ bookableId: fx.stayBookableId, ...win(60, 3) }),
    });

    const done = await markBookingCompleted({
      bookingId: booking.id,
      actorId: fx.customerA,
    });
    expect(done.status).toBe('COMPLETED');
    expect(done.completedAt).not.toBeNull();

    await expectApiError(
      markBookingCompleted({ bookingId: booking.id, actorId: fx.customerA }),
      409,
      'NOT_COMPLETABLE',
    );
  });

  it('expires stale PENDING holds (frees inventory)', async () => {
    const window = win(70, 3);
    const { booking } = await createBooking({
      customerId: fx.customerA,
      customerEmail: CUSTOMER,
      request: baseRequest({ bookableId: fx.stayBookableId, ...window }),
    });

    // Lapse the hold window.
    await db.booking.update({
      where: { id: booking.id },
      data: { holdExpiresAt: new Date(Date.now() - 60_000) },
    });

    const expired = await expireStaleBookings();
    expect(expired).toBeGreaterThanOrEqual(1);

    const row = await db.booking.findUnique({ where: { id: booking.id } });
    expect(row?.status).toBe('CANCELLED');
    expect(row?.cancelReason).toBe('hold_expired');

    // Freed inventory books immediately.
    const rebook = await createBooking({
      customerId: fx.customerB,
      customerEmail: CUSTOMER2,
      request: baseRequest({ bookableId: fx.stayBookableId, ...window }),
    });
    expect(rebook.booking.status).toBe('PENDING');
  });

  it('generateReference never contains ambiguous characters', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateReference()).toMatch(/^VI-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });
});

describe('admin oversight (booking detail actions)', () => {
  // The admin booking detail page drives cancel via the shared customer
  // cancel route and complete via the admin complete route; both rely on
  // the service-layer admin bypass (no ownership scope). These tests lock
  // that contract: an ADMIN actor manages any booking, and the state
  // machine still refuses illegal transitions.
  it('an ADMIN can cancel another customer’s booking without owning the business', async () => {
    const admin = await db.user.create({
      data: { email: `admin-${SUFFIX}@booking.test`, passwordHash: 'x', role: 'ADMIN', locale: 'en' },
    });
    // Note: earlier tests occupy windows 7–90 on the stay bookable (the
    // concurrency test holds win(80)); keep admin-test windows clear of them.
    const { booking } = await createBooking({
      customerId: fx.customerA,
      customerEmail: CUSTOMER,
      request: baseRequest({ bookableId: fx.stayBookableId, ...win(100, 3) }),
    });

    const cancelled = await cancelBooking({
      bookingId: booking.id,
      actorId: admin.id,
      reason: 'admin action',
    });
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancelReason).toBe('admin action');

    // The state machine is unchanged for admins: a cancelled booking
    // cannot be cancelled again.
    await expectApiError(
      cancelBooking({ bookingId: booking.id, actorId: admin.id }),
      409,
      'NOT_CANCELLABLE',
    );
  });

  it('an ADMIN can complete a booking, and re-completion still conflicts', async () => {
    const admin = await db.user.create({
      data: { email: `admin2-${SUFFIX}@booking.test`, passwordHash: 'x', role: 'ADMIN', locale: 'en' },
    });
    const { booking } = await createBooking({
      customerId: fx.customerB,
      customerEmail: CUSTOMER2,
      request: baseRequest({ bookableId: fx.stayBookableId, ...win(110, 3) }),
    });

    const done = await markBookingCompleted({ bookingId: booking.id, actorId: admin.id });
    expect(done.status).toBe('COMPLETED');
    expect(done.completedAt).not.toBeNull();

    await expectApiError(
      markBookingCompleted({ bookingId: booking.id, actorId: admin.id }),
      409,
      'NOT_COMPLETABLE',
    );
  });
});
