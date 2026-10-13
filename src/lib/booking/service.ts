import { Prisma } from '@prisma/client';
import type { BookableCategory, Booking, BookingStatus, Prisma as PrismaT } from '@prisma/client';
import { db } from '@/lib/db';
import { ApiError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';
import {
  getHoldMinutes,
  resolveCommissionRate,
  resolveDepositConfig,
  resolveCancellation,
} from '@/lib/settings';
import { parseDateOnly, todayUtc } from '@/lib/booking/dates';
import {
  computeCommission,
  computeDepositAmount,
  computeQuantity,
  computeSubtotal,
  money,
  pickPrice,
} from '@/lib/booking/pricing';
import { checkAvailability } from '@/lib/booking/availability';
import { notify } from '@/lib/notifications';
import { recordEvent } from '@/lib/analytics';

/**
 * Booking service — one reusable engine for every bookable category
 * (spec sections 32, 36–38).
 *
 * Invariants enforced here (server = source of truth):
 * - price, commission, deposit are ALWAYS computed server-side
 * - availability is re-checked inside the transaction that holds the
 *   bookable row lock (no double bookings, even under concurrency)
 * - unpaid PENDING bookings hold inventory for a configurable window only
 * - every state change is audited
 */

const REFERENCE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const REFERENCE_LENGTH = 6;

export function generateReference(): string {
  let out = '';
  const bytes = new Uint8Array(REFERENCE_LENGTH);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += REFERENCE_ALPHABET[b % REFERENCE_ALPHABET.length];
  return `VI-${out}`;
}

const bookableInclude = {
  business: {
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      config: true,
      ownerId: true,
      type: true,
    },
  },
  unit: { select: { id: true, name: true, capacity: true } },
  guideService: { select: { id: true, name: true } },
  prices: true,
} satisfies PrismaT.BookableInclude;

type BookableWithRelations = PrismaT.BookableGetPayload<{ include: typeof bookableInclude }>;

export type BookingRequest = {
  bookableId: string;
  /** date-only strings YYYY-MM-DD */
  startDate: string;
  endDate: string;
  guests: number;
  paymentMode?: 'FULL' | 'DEPOSIT';
  customerName?: string;
  customerPhone?: string;
  customerNote?: string;
};

export type BookingQuote = {
  bookable: {
    id: string;
    category: BookableCategory;
    name: string;
    businessId: string;
    businessName: string;
    businessSlug: string;
  };
  startDate: string;
  endDate: string;
  nights: number | null;
  days: number;
  guests: number;
  pricing: {
    unit: string;
    unitPrice: string;
    currency: string;
    quantity: number;
    subtotal: string;
  };
  deposit: { enabled: boolean; percent: number; amount: string } | null;
  total: string;
  currency: string;
  cancellation: { text: string | null; freeCancellationHours: number | null };
  availability: { available: boolean; unavailableDates: string[] };
  holdMinutes: number;
};

async function loadBookable(bookableId: string): Promise<BookableWithRelations> {
  const bookable = await db.bookable.findUnique({
    where: { id: bookableId },
    include: bookableInclude,
  });
  if (!bookable) throw ApiError.notFound('Bookable not found');
  return bookable;
}

function assertBookablePublic(bookable: BookableWithRelations): void {
  if (bookable.status !== 'PUBLISHED') {
    throw ApiError.notFound('Bookable not found');
  }
  if (bookable.business.status !== 'PUBLISHED') {
    throw ApiError.notFound('Bookable not found');
  }
}

function bookableName(bookable: BookableWithRelations): string {
  return bookable.unit?.name ?? bookable.guideService?.name ?? bookable.slug;
}

function validateDates(start: Date, end: Date, category: BookableCategory): void {
  const startDay = start.getTime();
  const endDay = end.getTime();
  const today = todayUtc().getTime();
  if (startDay < today) {
    throw ApiError.badRequest('DATE_IN_PAST', 'Start date is in the past');
  }
  if (category === 'ACCOMMODATION' ? endDay <= startDay : endDay < startDay) {
    throw ApiError.badRequest('INVALID_DATE_RANGE', 'End date must be after the start date');
  }
  if (diffDaysSafe(start, end) > 365) {
    throw ApiError.badRequest('DATE_RANGE_TOO_LONG', 'Date range too long');
  }
}

function diffDaysSafe(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * Compute a full, authoritative price + availability quote. Read-only.
 * Never returns commission information (platform-internal).
 */
export async function quoteBooking(request: BookingRequest): Promise<BookingQuote> {
  const bookable = await loadBookable(request.bookableId);
  assertBookablePublic(bookable);

  const startDate = parseDateOnly(request.startDate);
  const endDate = parseDateOnly(request.endDate);
  validateDates(startDate, endDate, bookable.category);

  if (request.guests < 1) {
    throw ApiError.badRequest('INVALID_GUESTS', 'At least one guest is required');
  }
  const capacity = bookable.unit?.capacity ?? bookable.capacity;
  if (bookable.category === 'ACCOMMODATION' && capacity && request.guests > capacity) {
    throw ApiError.badRequest(
      'GUESTS_EXCEED_CAPACITY',
      `This accommodation sleeps at most ${capacity} guests`,
    );
  }
  if (bookable.category === 'GUIDE' && bookable.capacity && request.guests > bookable.capacity) {
    throw ApiError.badRequest(
      'GUESTS_EXCEED_CAPACITY',
      `This guide service accepts at most ${bookable.capacity} participants`,
    );
  }

  // --- price (server-side only) ------------------------------------------
  const category = bookable.category as BookableCategory;
  const pricingUnit = bookable.prices.find((p) => p.active)?.unit ?? inferUnit(category);
  const priced = pickPrice(bookable.prices, pricingUnit, startDate, endDate);

  if (!priced.ok) {
    throw ApiError.conflict('PRICE_NOT_CONFIGURED', 'Pricing is not configured for this service');
  }

  const quantity = computeQuantity(pricingUnit, startDate, endDate, request.guests);
  if (quantity < 1) {
    throw ApiError.badRequest('INVALID_DATE_RANGE', 'End date must be after the start date');
  }
  const unitPrice = money(priced.price.amount.toString());
  const subtotal = computeSubtotal(unitPrice, quantity);
  const currency = priced.price.currency;

  // --- deposit + cancellation ---------------------------------------------
  const businessConfig = (bookable.business.config ?? {}) as Record<string, unknown>;
  const bookableConfig = (bookable.config ?? {}) as Record<string, unknown>;
  const deposit = await resolveDepositConfig({
    category,
    businessConfig: businessConfig as never,
    bookableConfig: bookableConfig as never,
  });
  const depositAmount = deposit.enabled ? computeDepositAmount(subtotal, deposit.percent) : null;

  // --- availability (read-only snapshot) ----------------------------------
  const requestedSlots = bookable.category === 'GUIDE' ? Math.max(1, request.guests) : 1;
  const outcome = await checkAvailability({
    bookableId: bookable.id,
    category: bookable.category,
    pricingUnit,
    startDate,
    endDate,
    requestedSlots,
    tx: db,
  });

  void recordEvent('booking_started', {
    entityType: 'bookable',
    entityId: bookable.id,
    meta: { category: bookable.category, guests: request.guests },
  });

  const cancellation = resolveCancellation(businessConfig as never, bookableConfig as never);

  return {
    bookable: {
      id: bookable.id,
      category: bookable.category,
      name: bookableName(bookable),
      businessId: bookable.business.id,
      businessName: bookable.business.name,
      businessSlug: bookable.business.slug,
    },
    startDate: request.startDate,
    endDate: request.endDate,
    nights: pricingUnit === 'NIGHT' ? diffDaysSafe(startDate, endDate) : null,
    days: diffDaysSafe(startDate, endDate) + 1,
    guests: request.guests,
    pricing: {
      unit: pricingUnit,
      unitPrice: unitPrice.toString(),
      currency,
      quantity,
      subtotal: subtotal.toString(),
    },
    deposit:
      deposit.enabled && depositAmount
        ? { enabled: true, percent: deposit.percent, amount: depositAmount.toString() }
        : null,
    total: subtotal.toString(),
    currency,
    cancellation,
    availability: {
      available: outcome.available,
      unavailableDates: outcome.available
        ? []
        : outcome.dates
            .filter((d) => d.remaining < requestedSlots)
            .map((d) => d.date.toISOString().slice(0, 10)),
    },
    holdMinutes: await getHoldMinutes(),
  };
}

function inferUnit(category: BookableCategory): 'NIGHT' | 'PERSON' {
  return category === 'ACCOMMODATION' ? 'NIGHT' : 'PERSON';
}

export type CreateBookingResult = {
  booking: Booking;
  /** True when an existing booking was returned for a repeated idempotency key. */
  idempotent: boolean;
};

/**
 * Create a booking with double-booking protection (spec section 37):
 *  1. BEGIN transaction
 *  2. SELECT ... FOR UPDATE on the bookable row (serialises writers)
 *  3. re-price and re-check availability with the lock held
 *  4. INSERT booking + item + commission snapshot
 *  5. COMMIT
 */
export async function createBooking(input: {
  customerId: string;
  customerEmail: string;
  request: BookingRequest;
  idempotencyKey?: string | null;
  meta?: { ip?: string; userAgent?: string | null };
}): Promise<CreateBookingResult> {
  const { customerId, customerEmail, request, idempotencyKey } = input;

  // Fast path: repeated submission with the same idempotency key.
  if (idempotencyKey) {
    const existing = await db.booking.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (existing.customerId !== customerId) {
        throw ApiError.forbidden('Idempotency key belongs to another customer');
      }
      return { booking: existing, idempotent: true };
    }
  }

  const startDate = parseDateOnly(request.startDate);
  const endDate = parseDateOnly(request.endDate);
  const holdMinutes = await getHoldMinutes();

  try {
    const booking = await db.$transaction(async (tx) => {
      // 1. Lock the bookable row — serialises concurrent booking attempts.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "bookables" WHERE id = ${request.bookableId} FOR UPDATE`;
      if (locked.length === 0) throw ApiError.notFound('Bookable not found');

      const bookable = await tx.bookable.findUnique({
        where: { id: request.bookableId },
        include: bookableInclude,
      });
      if (!bookable) throw ApiError.notFound('Bookable not found');
      assertBookablePublic(bookable);

      validateDates(startDate, endDate, bookable.category);

      // 2. Price (never from the client).
      const pricingUnit =
        bookable.prices.find((p) => p.active)?.unit ?? inferUnit(bookable.category);
      const priced = pickPrice(bookable.prices, pricingUnit, startDate, endDate);
      if (!priced.ok) {
        throw ApiError.conflict(
          'PRICE_NOT_CONFIGURED',
          'Pricing is not configured for this service',
        );
      }
      const quantity = computeQuantity(pricingUnit, startDate, endDate, request.guests);
      if (quantity < 1) {
        throw ApiError.badRequest('INVALID_DATE_RANGE', 'End date must be after the start date');
      }

      const capacity = bookable.unit?.capacity ?? bookable.capacity;
      if (capacity && request.guests > capacity) {
        throw ApiError.badRequest('GUESTS_EXCEED_CAPACITY', 'Guests exceed capacity');
      }

      // 3. Availability with the lock held.
      const requestedSlots = bookable.category === 'GUIDE' ? Math.max(1, request.guests) : 1;
      const outcome = await checkAvailability({
        bookableId: bookable.id,
        category: bookable.category,
        pricingUnit,
        startDate,
        endDate,
        requestedSlots,
        tx,
      });
      if (!outcome.available) {
        throw ApiError.conflict('NOT_AVAILABLE', 'Not available for the selected dates');
      }

      // 4. Money — computed exclusively server-side.
      const unitPrice = money(priced.price.amount.toString());
      const subtotal = computeSubtotal(unitPrice, quantity);
      const currency = priced.price.currency;

      const businessConfig = (bookable.business.config ?? {}) as never;
      const bookableConfig = (bookable.config ?? {}) as never;
      const deposit = await resolveDepositConfig({
        category: bookable.category,
        businessConfig,
        bookableConfig,
      });
      const depositAmount = deposit.enabled
        ? computeDepositAmount(subtotal, deposit.percent)
        : null;
      const requestedMode = request.paymentMode ?? 'FULL';
      const paymentMode: 'FULL' | 'DEPOSIT' =
        requestedMode === 'DEPOSIT' && depositAmount ? 'DEPOSIT' : 'FULL';

      const commissionRate = await resolveCommissionRate(bookable.category);
      const commission = computeCommission(subtotal, commissionRate);
      const cancellation = resolveCancellation(businessConfig, bookableConfig);

      // 5. Insert (with a unique reference).
      let created: Booking | null = null;
      for (let attempt = 0; attempt < 4 && !created; attempt++) {
        const reference = generateReference();
        try {
          created = await tx.booking.create({
            data: {
              reference,
              customerId,
              customerEmail,
              customerName: request.customerName?.slice(0, 120) ?? null,
              customerPhone: request.customerPhone?.slice(0, 40) ?? null,
              customerNote: request.customerNote?.slice(0, 1000) ?? null,
              businessId: bookable.business.id,
              startDate,
              endDate,
              guests: request.guests,
              currency,
              subtotal,
              total: subtotal,
              commissionRate: commission.rate,
              commissionAmount: commission.amount,
              depositEnabled: Boolean(depositAmount),
              depositAmount,
              paymentMode,
              cancellationPolicyText: cancellation.text,
              holdExpiresAt: new Date(Date.now() + holdMinutes * 60_000),
              idempotencyKey: idempotencyKey ?? null,
              items: {
                create: {
                  bookableId: bookable.id,
                  startDate,
                  endDate,
                  guests: request.guests,
                  quantity,
                  pricingUnit,
                  unitPrice,
                  subtotal,
                },
              },
              commissions: {
                create: {
                  ratePercent: commission.rate,
                  baseAmount: subtotal,
                  amount: commission.amount,
                  currency,
                },
              },
            },
          });
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            // reference collision — retry; idempotency key handled below
            if (
              idempotencyKey &&
              (err.meta as { target?: string[] })?.target?.includes('idempotencyKey')
            ) {
              const existing = await tx.booking.findUnique({ where: { idempotencyKey } });
              if (existing) return existing;
            }
            continue;
          }
          throw err;
        }
      }
      if (!created) throw ApiError.internal('Could not allocate booking reference');

      return created;
    });

    // Side effects (outside the transaction — never block the booking itself).
    void audit({
      actorId: customerId,
      action: AUDIT_ACTIONS.bookingCreated,
      entityType: 'booking',
      entityId: booking.id,
      metadata: {
        reference: booking.reference,
        businessId: booking.businessId,
        total: booking.total.toString(),
        currency: booking.currency,
      },
      ip: input.meta?.ip,
      userAgent: input.meta?.userAgent,
    });
    void recordEvent('booking_completed', {
      entityType: 'booking',
      entityId: booking.id,
      userId: customerId,
    }).catch(() => undefined);
    void notifyBookingCreated(booking).catch((err) =>
      logger.error('notify_booking_created_failed', { error: String(err) }),
    );

    return { booking, idempotent: false };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('booking_create_failed', {
      error: error instanceof Error ? error.message : String(error),
      bookableId: request.bookableId,
    });
    throw ApiError.internal('Could not create booking');
  }
}

async function notifyBookingCreated(booking: Booking) {
  await notify(booking.customerId, 'booking.created', { ref: booking.reference });
  const business = await db.business.findUnique({
    where: { id: booking.businessId },
    select: { ownerId: true },
  });
  if (business) {
    await notify(business.ownerId, 'booking.created', { ref: booking.reference });
  }
}

/** Booking statuses that may still transition to CANCELLED. */
export const CANCELLABLE: BookingStatus[] = ['PENDING', 'CONFIRMED'];

export async function cancelBooking(input: {
  bookingId: string;
  actorId: string;
  reason?: string;
  ip?: string;
}): Promise<Booking> {
  const booking = await db.booking.findUnique({
    where: { id: input.bookingId },
    include: { business: { select: { ownerId: true } } },
  });
  if (!booking) throw ApiError.notFound('Booking not found');

  // Ownership check: only the customer, the business owner, or an admin may cancel.
  const isCustomer = booking.customerId === input.actorId;
  const isOwner = booking.business?.ownerId === input.actorId;
  const actor = await db.user.findUnique({ where: { id: input.actorId }, select: { role: true } });
  const isAdmin = actor?.role === 'ADMIN' || actor?.role === 'SUPER_ADMIN';
  if (!isCustomer && !isOwner && !isAdmin) {
    throw ApiError.notFound('Booking not found');
  }

  if (!CANCELLABLE.includes(booking.status)) {
    throw ApiError.conflict('NOT_CANCELLABLE', 'This booking can no longer be cancelled');
  }

  const updated = await db.$transaction(async (tx) => {
    // Lock the bookable so cancellation serialises with new bookings.
    const items = await tx.bookingItem.findMany({ where: { bookingId: booking.id } });
    for (const item of items) {
      await tx.$queryRaw`SELECT id FROM "bookables" WHERE id = ${item.bookableId} FOR UPDATE`;
    }
    return tx.booking.update({
      where: { id: booking.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: input.reason?.slice(0, 500) ?? null,
      },
    });
  });

  void audit({
    actorId: input.actorId,
    action: AUDIT_ACTIONS.bookingCancelled,
    entityType: 'booking',
    entityId: booking.id,
    metadata: { reference: booking.reference, reason: input.reason },
    ip: input.ip,
  });
  void notify(booking.customerId, 'booking.cancelled', { ref: booking.reference }).catch(
    () => undefined,
  );

  return updated;
}

/** Provider/admin marks a booking completed (enables the review). */
export async function markBookingCompleted(input: {
  bookingId: string;
  actorId: string;
}): Promise<Booking> {
  const booking = await db.booking.findUnique({ where: { id: input.bookingId } });
  if (!booking) throw ApiError.notFound('Booking not found');
  if (booking.status !== 'CONFIRMED' && booking.status !== 'PENDING') {
    throw ApiError.conflict(
      'NOT_COMPLETABLE',
      'Only confirmed or pending bookings can be completed',
    );
  }

  const updated = await db.booking.update({
    where: { id: booking.id },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });

  void audit({
    actorId: input.actorId,
    action: AUDIT_ACTIONS.bookingCompleted,
    entityType: 'booking',
    entityId: booking.id,
    metadata: { reference: booking.reference },
  });
  void notify(booking.customerId, 'review.requested', { ref: booking.reference }).catch(
    () => undefined,
  );

  return updated;
}

/**
 * Expire unpaid PENDING bookings whose hold window lapsed (frees inventory).
 * Run as a scheduled job; also invoked opportunistically by the booking path.
 */
export async function expireStaleBookings(): Promise<number> {
  const stale = await db.booking.findMany({
    where: { status: 'PENDING', holdExpiresAt: { lt: new Date() } },
    select: { id: true },
  });
  if (stale.length === 0) return 0;

  const res = await db.booking.updateMany({
    where: { id: { in: stale.map((s) => s.id) } },
    data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'hold_expired' },
  });
  logger.info('bookings_expired', { count: res.count });
  return res.count;
}
