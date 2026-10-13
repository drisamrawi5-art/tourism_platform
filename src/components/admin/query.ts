/** Small helpers for reading Next.js searchParams (server) and building URLs. */

export type SearchParams = Record<string, string | string[] | undefined>;

/** First value of a possibly repeated search param. */
export function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Positive page number, defaulting to 1. */
export function parsePage(value: string | undefined): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Keep only values from a known option list (invalid input becomes ""). */
export function oneOf<T extends string>(
  value: string | undefined,
  options: readonly T[],
): T | "" {
  return value !== undefined && (options as readonly string[]).includes(value)
    ? (value as T)
    : "";
}

/** Client-side idempotency key for refund requests (browser crypto). */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `refund-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
