import type { BookableCategory, Prisma, PricingUnit } from '@prisma/client';
import { addDays, eachDate } from '@/lib/booking/dates';

/**
 * Availability engine (spec sections 37–38).
 *
 * Capacity for a date = max capacity among matching rules
 *   (AvailabilityRule covering the date, weekday match), or 0 when no rule
 *   matches — availability is NEVER fabricated.
 * A matching AvailabilityBlock either zeroes the date or applies its
 * capacityOverride.
 *
 * "Used" counts come from active bookings:
 *   PENDING (within hold window), CONFIRMED, COMPLETED.
 * Accommodation units consume one slot per booking; guides consume `guests`
 * participant slots.
 *
 * The booking path calls this INSIDE a transaction after taking a row lock on
 * the Bookable (SELECT ... FOR UPDATE), serialising concurrent bookings for
 * the same bookable — see booking/service.ts.
 */

export type OccupancyRange = { from: Date; to: Date }; // [from, to)

/** Which calendar dates a booking occupies, given its pricing unit. */
export function occupancyRange(pricingUnit: PricingUnit, start: Date, end: Date): OccupancyRange {
  if (pricingUnit === 'NIGHT') {
    return { from: start, to: end }; // checkout day is free
  }
  // Single-day or multi-day services occupy every selected date inclusive.
  return { from: start, to: addDays(end, 1) };
}

export type DateAvailability = {
  date: Date;
  capacity: number;
  used: number;
  remaining: number;
};

export type AvailabilityOutcome = {
  available: boolean;
  dates: DateAvailability[];
  /** First date that cannot accommodate the request (when unavailable). */
  insufficientOn?: Date;
};

export type AvailabilityCheckInput = {
  bookableId: string;
  category: BookableCategory;
  pricingUnit: PricingUnit;
  startDate: Date;
  endDate: Date;
  /** Slots requested: 1 for accommodation, guests for guides. */
  requestedSlots: number;
  /** Prisma transaction client (REQUIRED on the booking path for consistency). */
  tx: Prisma.TransactionClient;
};

const ACTIVE_STATUSES = ['PENDING', 'CONFIRMED', 'COMPLETED'] as const;

type RuleRow = {
  startDate: Date;
  endDate: Date | null;
  weekday: number | null;
  capacity: number;
};
type BlockRow = { startDate: Date; endDate: Date; state: string; capacityOverride: number | null };

function ruleCovers(rule: RuleRow, date: Date): boolean {
  const t = date.getTime();
  if (rule.startDate.getTime() > t) return false;
  if (rule.endDate && rule.endDate.getTime() < t) return false;
  if (rule.weekday !== null && rule.weekday !== date.getUTCDay()) return false;
  return true;
}

function blockCovers(block: BlockRow, date: Date): boolean {
  const t = date.getTime();
  return block.startDate.getTime() <= t && t < block.endDate.getTime();
}

/**
 * Compute per-date availability and whether the request fits.
 * Must run inside the same transaction that locked the bookable row.
 */
export async function checkAvailability(
  input: AvailabilityCheckInput,
): Promise<AvailabilityOutcome> {
  const { tx, bookableId, startDate, endDate, pricingUnit, requestedSlots } = input;
  const now = new Date();

  const [rules, blocks, items] = await Promise.all([
    tx.availabilityRule.findMany({ where: { bookableId } }),
    tx.availabilityBlock.findMany({
      where: { bookableId, startDate: { lte: endDate }, endDate: { gt: startDate } },
    }),
    tx.bookingItem.findMany({
      where: {
        bookableId,
        booking: {
          status: { in: [...ACTIVE_STATUSES] },
          // PENDING bookings only hold inventory inside their hold window.
          OR: [{ status: { not: 'PENDING' } }, { holdExpiresAt: { gt: now } }],
        },
      },
      select: {
        startDate: true,
        endDate: true,
        pricingUnit: true,
        booking: { select: { guests: true } },
      },
    }),
  ]);

  const occupancy = occupancyRange(pricingUnit, startDate, endDate);
  const occupancyDates = eachDate(occupancy.from, occupancy.to);

  const relevant = items
    .map((item) => {
      const range = occupancyRange(item.pricingUnit, item.startDate, item.endDate);
      const slots = input.category === 'GUIDE' ? Math.max(1, item.booking.guests) : 1;
      return { range, slots };
    })
    .filter(
      (i) =>
        i.range.from.getTime() < occupancy.to.getTime() &&
        i.range.to.getTime() > occupancy.from.getTime(),
    );

  const dates: DateAvailability[] = [];
  let available = true;
  let insufficientOn: Date | undefined;

  for (const date of occupancyDates) {
    let capacity = 0;
    for (const rule of rules as RuleRow[]) {
      if (ruleCovers(rule, date)) capacity = Math.max(capacity, rule.capacity);
    }
    for (const block of blocks as BlockRow[]) {
      if (blockCovers(block, date)) {
        capacity = block.capacityOverride ?? 0;
        if (block.capacityOverride === null) capacity = 0;
      }
    }

    let used = 0;
    for (const item of relevant) {
      if (item.range.from.getTime() <= date.getTime() && date.getTime() < item.range.to.getTime()) {
        used += item.slots;
      }
    }

    const remaining = Math.max(0, capacity - used);
    const fits = remaining >= requestedSlots;
    if (!fits && available) {
      available = false;
      insufficientOn = date;
    }
    dates.push({ date, capacity, used, remaining });
  }

  return { available, dates, insufficientOn };
}

/**
 * Public availability view (calendar/list) — read-only, no locks.
 * Returns per-date capacity/used/remaining across a range for one bookable.
 */
export async function availabilityOverview(input: {
  bookableId: string;
  category: BookableCategory;
  from: Date;
  to: Date;
  tx?: Prisma.TransactionClient;
}): Promise<DateAvailability[]> {
  const client = input.tx;
  if (!client) throw new Error('availabilityOverview requires a db client');

  const [rules, blocks, items] = await Promise.all([
    client.availabilityRule.findMany({ where: { bookableId: input.bookableId } }),
    client.availabilityBlock.findMany({
      where: {
        bookableId: input.bookableId,
        startDate: { lte: input.to },
        endDate: { gt: input.from },
      },
    }),
    client.bookingItem.findMany({
      where: {
        bookableId: input.bookableId,
        booking: {
          status: { in: [...ACTIVE_STATUSES] },
          OR: [{ status: { not: 'PENDING' } }, { holdExpiresAt: { gt: new Date() } }],
        },
      },
      select: {
        startDate: true,
        endDate: true,
        pricingUnit: true,
        booking: { select: { guests: true } },
      },
    }),
  ]);

  const occupancyDates = eachDate(input.from, input.to);
  return occupancyDates.map((date) => {
    let capacity = 0;
    for (const rule of rules as RuleRow[]) {
      if (ruleCovers(rule, date)) capacity = Math.max(capacity, rule.capacity);
    }
    for (const block of blocks as BlockRow[]) {
      if (blockCovers(block, date)) {
        capacity = block.capacityOverride !== null ? block.capacityOverride : 0;
      }
    }
    let used = 0;
    for (const item of items) {
      const range = occupancyRange(item.pricingUnit, item.startDate, item.endDate);
      if (range.from.getTime() <= date.getTime() && date.getTime() < range.to.getTime()) {
        used += input.category === 'GUIDE' ? Math.max(1, item.booking.guests) : 1;
      }
    }
    return { date, capacity, used, remaining: Math.max(0, capacity - used) };
  });
}
