import type { Locale } from '@/i18n/config';

/**
 * Query-string helpers for the public discovery pages.
 *
 * Next 15 pages receive `searchParams` as a Promise; these helpers read and
 * rebuild query strings without any client-side JS (filter forms are plain
 * GET forms, pagination preserves the active filters).
 */

export type SearchParams = { [key: string]: string | string[] | undefined };

/** Read a positive integer query value; returns null when absent/invalid. */
export function readInt(
  value: string | string[] | undefined,
  min = 1,
  max = Number.MAX_SAFE_INTEGER,
): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

/** Read a short trimmed string query value; returns null when absent/invalid. */
export function readString(value: string | string[] | undefined, maxLength = 80): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed.length > maxLength) return null;
  return trimmed;
}

/**
 * Build a locale-prefixed href that keeps the current query params and
 * applies overrides (`undefined` removes the key).
 */
export function queryHref(
  locale: Locale,
  path: string,
  params: SearchParams,
  overrides: Record<string, string | number | undefined> = {},
): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const one of value) if (one !== '') query.append(key, one);
    } else if (value !== '') {
      query.set(key, value);
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || value === '') query.delete(key);
    else query.set(key, String(value));
  }

  const qs = query.toString();
  return `/${locale}${path}${qs ? `?${qs}` : ''}`;
}
