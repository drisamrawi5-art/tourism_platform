import { intlLocale, type Locale } from '@/i18n/config';

/**
 * Centralised currency formatting (spec section 68).
 * Components MUST NOT hardcode currency strings — always call formatMoney().
 *
 * Primary currency: MAD. Future: EUR, USD, GBP (add to CurrencyCode and the
 * rates table when enabled — no hardcoded conversion rates anywhere).
 */

export const currencies = ['MAD', 'EUR', 'USD', 'GBP'] as const;
export type CurrencyCode = (typeof currencies)[number];

export const defaultCurrency: CurrencyCode = 'MAD';

export function isCurrencyCode(v: unknown): v is CurrencyCode {
  return typeof v === 'string' && (currencies as readonly string[]).includes(v);
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function formatter(locale: Locale, currency: CurrencyCode): Intl.NumberFormat {
  const key = `${locale}:${currency}`;
  let f = formatterCache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(intlLocale(locale), {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
    } catch {
      f = new Intl.NumberFormat('en', { style: 'currency', currency });
    }
    formatterCache.set(key, f);
  }
  return f;
}

/**
 * Format an amount for display. Accepts number, numeric string or Prisma
 * Decimal (anything convertible via Number()).
 */
export function formatMoney(
  amount: number | string | { toString(): string },
  currency: CurrencyCode = defaultCurrency,
  locale: Locale = 'en',
): string {
  const n = typeof amount === 'number' ? amount : Number(amount.toString());
  if (!Number.isFinite(n)) return '—';
  return formatter(locale, currency).format(n);
}

/** Plain number formatting (counts, capacities). */
export function formatNumber(value: number, locale: Locale = 'en'): string {
  try {
    return new Intl.NumberFormat(intlLocale(locale)).format(value);
  } catch {
    return String(value);
  }
}

/** Date formatting driven by locale (dates are date-only semantics). */
export function formatDate(
  date: Date | string,
  locale: Locale = 'en',
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat(intlLocale(locale), options).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}
