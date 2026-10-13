import { Prisma, type PricingUnit, type Price } from '@prisma/client';
import { addDays, diffDays } from '@/lib/booking/dates';

/**
 * Server-side price engine (spec section 39).
 *
 * - The frontend NEVER computes or submits prices.
 * - V1 rules: base price (validFrom/validTo null) and seasonal rules whose
 *   window fully covers the requested stay, resolved by priority.
 * - Future: special offers, taxes and fees — extend here, not in routes.
 */

export type PriceQuoteLine = {
  unit: PricingUnit;
  unitPrice: Prisma.Decimal;
  quantity: number;
  subtotal: Prisma.Decimal;
  currency: string;
};

export type PriceResolution =
  { ok: true; price: Price } | { ok: false; reason: 'NO_PRICE' | 'NO_ACTIVE_PRICE' };

/**
 * Number of chargeable units:
 *  - NIGHT: nights (end exclusive)
 *  - DAY: calendar days touched (inclusive span)
 *  - PERSON: participants
 *  - SERVICE: flat 1
 */
export function computeQuantity(unit: PricingUnit, start: Date, end: Date, guests: number): number {
  switch (unit) {
    case 'NIGHT': {
      const nights = diffDays(start, end);
      return nights;
    }
    case 'DAY': {
      const days = diffDays(start, end);
      return Math.max(1, days) + (days > 0 ? 1 : 0); // inclusive span
    }
    case 'PERSON':
      return Math.max(1, guests);
    case 'SERVICE':
      return 1;
  }
}

export function money(value: number | string): Prisma.Decimal {
  return new Prisma.Decimal(value).toDecimalPlaces(2);
}

/**
 * Resolve the applicable price rule for a stay/service period.
 * Seasonal rules must fully cover the requested window; highest priority wins.
 */
export function pickPrice(
  prices: Price[],
  unit: PricingUnit,
  start: Date,
  end: Date,
): PriceResolution {
  const candidates = prices.filter((p) => p.active && p.unit === unit);
  if (candidates.length === 0) return { ok: false, reason: 'NO_PRICE' };

  const base = candidates.find((p) => p.validFrom === null && p.validTo === null);
  const seasonal = candidates
    .filter((p) => {
      if (p.validFrom === null || p.validTo === null) return false;
      const from = p.validFrom.getTime();
      const to = p.validTo.getTime();
      // For NIGHT stays the rule must cover the whole stay window; for
      // day/person/service the rule must cover the first and last day.
      const windowEnd = unit === 'NIGHT' ? end : addDays(end, 0);
      return (
        from <= start.getTime() && to >= (unit === 'NIGHT' ? end.getTime() : windowEnd.getTime())
      );
    })
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      const aFrom = a.validFrom?.getTime() ?? 0;
      const bFrom = b.validFrom?.getTime() ?? 0;
      return bFrom - aFrom;
    });

  const winner = seasonal[0] ?? base;
  if (!winner) return { ok: false, reason: 'NO_ACTIVE_PRICE' };
  return { ok: true, price: winner };
}

export function computeSubtotal(unitPrice: Prisma.Decimal, quantity: number): Prisma.Decimal {
  return unitPrice.mul(quantity).toDecimalPlaces(2);
}

export function computeDepositAmount(total: Prisma.Decimal, percent: number): Prisma.Decimal {
  return total.mul(percent).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function computeCommission(
  subtotal: Prisma.Decimal,
  ratePercent: number,
): { rate: Prisma.Decimal; amount: Prisma.Decimal } {
  const rate = new Prisma.Decimal(ratePercent).toDecimalPlaces(2);
  return {
    rate,
    amount: subtotal.mul(rate).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
  };
}
