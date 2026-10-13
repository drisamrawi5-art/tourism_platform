/**
 * Date-only helpers for the booking engine.
 *
 * Availability and bookings use calendar dates (not timestamps). All values
 * are parsed as UTC midnight to keep date-only semantics stable across
 * server timezones. V1 uses server-side UTC day boundaries (documented in
 * docs/booking.md).
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

export function isDateOnlyString(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function parseDateOnly(value: string): Date {
  if (!isDateOnlyString(value)) {
    throw new Error(`Invalid date-only value: ${value}`);
  }
  return new Date(`${value}T00:00:00.000Z`);
}

export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/** Whole days from a to b (b - a). */
export function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

export function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** All dates in [from, to) — exclusive end. */
export function eachDate(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  for (let d = from; d.getTime() < to.getTime(); d = addDays(d, 1)) {
    out.push(d);
  }
  return out;
}

export function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

/** Start of the UTC day containing `date`. */
export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
