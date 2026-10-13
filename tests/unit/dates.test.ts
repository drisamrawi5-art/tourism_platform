import { describe, expect, it } from 'vitest';
import {
  addDays,
  diffDays,
  eachDate,
  isDateOnlyString,
  maxDate,
  parseDateOnly,
  startOfUtcDay,
  toDateString,
  todayUtc,
} from '@/lib/booking/dates';

describe('date-only helpers', () => {
  it('validates date-only strings (format + real calendar date)', () => {
    expect(isDateOnlyString('2026-10-09')).toBe(true);
    expect(isDateOnlyString('2026-02-30')).toBe(false); // not a real day
    expect(isDateOnlyString('2026-10-9')).toBe(false);
    expect(isDateOnlyString('2026/10/09')).toBe(false);
    expect(isDateOnlyString('')).toBe(false);
    expect(isDateOnlyString(20261009)).toBe(false);
  });

  it('parses to UTC midnight and round-trips', () => {
    const d = parseDateOnly('2026-10-09');
    expect(d.getTime()).toBe(Date.UTC(2026, 9, 9));
    expect(toDateString(d)).toBe('2026-10-09');
  });

  it('rejects invalid input when parsing', () => {
    expect(() => parseDateOnly('nope')).toThrow();
    expect(() => parseDateOnly('2026-13-01')).toThrow();
  });

  it('addDays crosses month/year boundaries in UTC', () => {
    expect(toDateString(addDays(parseDateOnly('2026-12-31'), 1))).toBe('2027-01-01');
    expect(toDateString(addDays(parseDateOnly('2026-03-01'), -1))).toBe('2026-02-28');
  });

  it('diffDays computes whole days (b - a)', () => {
    expect(diffDays(parseDateOnly('2026-10-09'), parseDateOnly('2026-10-12'))).toBe(3);
    expect(diffDays(parseDateOnly('2026-10-12'), parseDateOnly('2026-10-09'))).toBe(-3);
    expect(diffDays(parseDateOnly('2026-10-09'), parseDateOnly('2026-10-09'))).toBe(0);
  });

  it('eachDate is inclusive-start, exclusive-end', () => {
    const days = eachDate(parseDateOnly('2026-10-09'), parseDateOnly('2026-10-12'));
    expect(days.map(toDateString)).toEqual(['2026-10-09', '2026-10-10', '2026-10-11']);
    // A NIGHT booking of 3 nights occupies exactly those 3 calendar days.
    expect(days).toHaveLength(diffDays(parseDateOnly('2026-10-09'), parseDateOnly('2026-10-12')));
  });

  it('eachDate returns empty for zero-length spans', () => {
    expect(eachDate(parseDateOnly('2026-10-09'), parseDateOnly('2026-10-09'))).toEqual([]);
  });

  it('todayUtc returns UTC midnight of the current UTC date', () => {
    const t = todayUtc();
    expect(t.getTime()).toBe(startOfUtcDay(t).getTime());
    expect(t.getUTCHours()).toBe(0);
  });

  it('maxDate picks the later date', () => {
    const a = parseDateOnly('2026-10-09');
    const b = parseDateOnly('2026-11-01');
    expect(maxDate(a, b)).toBe(b);
    expect(maxDate(b, a)).toBe(b);
  });
});
