import { describe, expect, it } from 'vitest';
import type { Price } from '@prisma/client';
import {
  computeCommission,
  computeDepositAmount,
  computeQuantity,
  computeSubtotal,
  money,
  pickPrice,
} from '@/lib/booking/pricing';
import { parseDateOnly } from '@/lib/booking/dates';

type PriceSeed = {
  id?: string;
  amount: string;
  unit?: Price['unit'];
  currency?: string;
  validFrom?: Date | null;
  validTo?: Date | null;
  priority?: number;
  active?: boolean;
};

function price(seed: PriceSeed): Price {
  // Prisma's Decimal fields make `as Price` unhappy — build the row shape
  // explicitly and cast once.
  return {
    id: seed.id ?? 'price_1',
    bookableId: 'bookable_1',
    unit: seed.unit ?? 'NIGHT',
    amount: seed.amount,
    currency: seed.currency ?? 'MAD',
    validFrom: seed.validFrom ?? null,
    validTo: seed.validTo ?? null,
    priority: seed.priority ?? 0,
    active: seed.active ?? true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  } as unknown as Price;
}

describe('computeQuantity', () => {
  const start = parseDateOnly('2026-10-09');
  const end = parseDateOnly('2026-10-12'); // 3 nights later

  it('NIGHT counts nights (end exclusive)', () => {
    expect(computeQuantity('NIGHT', start, end, 2)).toBe(3);
    expect(computeQuantity('NIGHT', start, start, 2)).toBe(0);
  });

  it('DAY counts the inclusive span', () => {
    expect(computeQuantity('DAY', start, end, 1)).toBe(4); // 9,10,11,12
    expect(computeQuantity('DAY', start, start, 1)).toBe(1); // same-day
  });

  it('PERSON charges per guest with a floor of 1', () => {
    expect(computeQuantity('PERSON', start, end, 4)).toBe(4);
    expect(computeQuantity('PERSON', start, end, 0)).toBe(1);
  });

  it('SERVICE is always 1', () => {
    expect(computeQuantity('SERVICE', start, end, 7)).toBe(1);
  });
});

describe('pickPrice', () => {
  const start = parseDateOnly('2026-10-09');
  const end = parseDateOnly('2026-10-12');

  it('returns NO_PRICE when the bookable has no prices', () => {
    expect(pickPrice([], 'NIGHT', start, end)).toEqual({ ok: false, reason: 'NO_PRICE' });
  });

  it('ignores inactive prices and mismatched units', () => {
    const inactive = price({ amount: '100', active: false });
    const wrongUnit = price({ amount: '50', unit: 'DAY' });
    expect(pickPrice([inactive, wrongUnit], 'NIGHT', start, end)).toEqual({
      ok: false,
      reason: 'NO_PRICE',
    });
  });

  it('uses the base price (both dates null) when nothing seasonal covers', () => {
    const base = price({ amount: '450' });
    const seasonal = price({
      amount: '900',
      validFrom: parseDateOnly('2027-01-01'),
      validTo: parseDateOnly('2027-02-01'),
    });
    const result = pickPrice([base, seasonal], 'NIGHT', start, end);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.price.id).toBe(base.id);
  });

  it('prefers a seasonal rule whose window fully covers the stay', () => {
    const base = price({ amount: '450' });
    const seasonal = price({
      amount: '600',
      validFrom: parseDateOnly('2026-10-01'),
      validTo: parseDateOnly('2026-10-31'),
    });
    const result = pickPrice([base, seasonal], 'NIGHT', start, end);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.price.amount.toString()).toBe('600');
  });

  it('rejects seasonal rules that only partially cover the stay', () => {
    const base = price({ amount: '450' });
    // ends mid-stay → not covering [start, end)
    const partial = price({
      amount: '600',
      validFrom: parseDateOnly('2026-10-01'),
      validTo: parseDateOnly('2026-10-10'),
    });
    const result = pickPrice([base, partial], 'NIGHT', start, end);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.price.id).toBe(base.id);
  });

  it('breaks ties by priority first, then by later validFrom', () => {
    const lowPriorityRecent = price({
      id: 'low',
      amount: '100',
      priority: 1,
      validFrom: parseDateOnly('2026-10-05'),
      validTo: parseDateOnly('2026-10-31'),
    });
    const highPriorityOlder = price({
      id: 'high',
      amount: '200',
      priority: 9,
      validFrom: parseDateOnly('2026-09-01'),
      validTo: parseDateOnly('2026-10-31'),
    });
    const result = pickPrice([lowPriorityRecent, highPriorityOlder], 'NIGHT', start, end);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.price.id).toBe('high');
  });

  it('returns NO_ACTIVE_PRICE when candidates exist but none resolve', () => {
    // Unit matches but no base and nothing covering → cannot price.
    const orphanSeasonal = price({
      amount: '600',
      validFrom: parseDateOnly('2027-01-01'),
      validTo: parseDateOnly('2027-02-01'),
    });
    const result = pickPrice([orphanSeasonal], 'NIGHT', start, end);
    expect(result).toEqual({ ok: false, reason: 'NO_ACTIVE_PRICE' });
  });
});

describe('money math', () => {
  // Prisma Decimal.toString() normalizes (no forced trailing zeros), so the
  // tests assert the numeric value at 2dp via toFixed rather than raw strings.
  const dp2 = (d: { toNumber(): number }): string => d.toNumber().toFixed(2);

  it('money() rounds to 2 decimals', () => {
    expect(dp2(money('1234.567'))).toBe('1234.57');
    expect(dp2(money(10))).toBe('10.00');
  });

  it('computeSubtotal multiplies and rounds', () => {
    expect(dp2(computeSubtotal(money('450.50'), 3))).toBe('1351.50');
  });

  it('computeDepositAmount applies percent with HALF_UP rounding', () => {
    expect(dp2(computeDepositAmount(money('1000'), 30))).toBe('300.00');
    expect(dp2(computeDepositAmount(money('999.99'), 15))).toBe('150.00'); // 149.9985 → 150.00
    expect(dp2(computeDepositAmount(money('100'), 0))).toBe('0.00');
  });

  it('computeCommission keeps rate at 2dp and rounds the amount', () => {
    const result = computeCommission(money('999.99'), 2.5);
    expect(dp2(result.rate)).toBe('2.50');
    expect(dp2(result.amount)).toBe('25.00'); // 24.99975 → 25.00
    expect(dp2(computeCommission(money('500'), 0).amount)).toBe('0.00');
  });
});
