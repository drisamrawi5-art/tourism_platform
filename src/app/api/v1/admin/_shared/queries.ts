import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';

/**
 * Shared query/body helpers for the admin API (colocated non-route file —
 * route.ts files may only export HTTP handlers, so helpers live here).
 */

// ---------------------------------------------------------------------------
// String-only enums (query params arrive as strings — parse numbers in handlers)
// ---------------------------------------------------------------------------

export const publicationStatuses = [
  'DRAFT',
  'PENDING_REVIEW',
  'APPROVED',
  'PUBLISHED',
  'REJECTED',
  'ARCHIVED',
] as const;
export const zPublicationStatus = z.enum(publicationStatuses);

export const roles = [
  'SUPER_ADMIN',
  'ADMIN',
  'CONTENT_MANAGER',
  'BUSINESS_OWNER',
  'GUIDE',
  'CUSTOMER',
] as const;
export const zRole = z.enum(roles);

export const userStatuses = ['ACTIVE', 'SUSPENDED', 'DELETED'] as const;
export const zUserStatus = z.enum(userStatuses);

export const bookingStatuses = [
  'PENDING',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
] as const;
export const zBookingStatus = z.enum(bookingStatuses);

export const paymentStatuses = ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'REFUNDED', 'FAILED'] as const;
export const zPaymentStatus = z.enum(paymentStatuses);

export const reviewStatuses = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export const zReviewStatus = z.enum(reviewStatuses);

export const mediaKinds = ['IMAGE', 'VIDEO'] as const;
export const zMediaKind = z.enum(mediaKinds);

export const contentKinds = [
  'PLACE',
  'DESTINATION',
  'STORY',
  'GUIDE',
  'ACCOMMODATION',
  'EDITORIAL',
  'EXPERIENCE',
  'EVENT',
  'RESTAURANT',
  'TRAVEL_GUIDE',
] as const;
export const zContentKind = z.enum(contentKinds);

export const businessTypes = [
  'ACCOMMODATION',
  'GUIDE',
  'RESTAURANT',
  'TRANSPORT',
  'EXPERIENCE',
  'ACTIVITY',
  'EVENT',
  'PARTNER',
] as const;
export const zBusinessType = z.enum(businessTypes);

export const verificationStatuses = [
  'VERIFIED',
  'PROJECT_PROVIDED',
  'PROVIDER_PROVIDED',
  'EDITORIAL',
  'PENDING_VERIFICATION',
] as const;
export const zVerificationStatus = z.enum(verificationStatuses);

/** YYYY-MM-DD query-string date (validated here, parsed in handlers). */
export const dateOnlyQuery = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** Parse a YYYY-MM-DD string into a real calendar date (UTC). Null if invalid. */
export function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [yRaw, moRaw, dRaw] = value.split('-');
  const y = Number.parseInt(yRaw ?? '', 10);
  const mo = Number.parseInt(moRaw ?? '', 10);
  const d = Number.parseInt(dRaw ?? '', 10);
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date;
}

/**
 * Build a `createdAt` filter from optional YYYY-MM-DD `from`/`to` strings
 * (inclusive whole days). Throws 400 on malformed dates. Returns undefined
 * when neither bound is present so it can be spread into a where clause.
 */
export function createdAtRange(
  from: string | undefined,
  to: string | undefined,
): { gte?: Date; lte?: Date } | undefined {
  const range: { gte?: Date; lte?: Date } = {};
  if (from !== undefined) {
    const start = parseDateOnly(from);
    if (!start) throw ApiError.badRequest('INVALID_DATE', 'from must be a valid YYYY-MM-DD date');
    range.gte = start;
  }
  if (to !== undefined) {
    const endDay = parseDateOnly(to);
    if (!endDay) throw ApiError.badRequest('INVALID_DATE', 'to must be a valid YYYY-MM-DD date');
    // Inclusive end of day.
    range.lte = new Date(endDay.getTime() + 86_400_000 - 1);
  }
  return range.gte !== undefined || range.lte !== undefined ? range : undefined;
}

export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

// ---------------------------------------------------------------------------
// Translations (en required, fr/ar optional)
// ---------------------------------------------------------------------------

export const placeTranslationInput = z.object({
  name: z.string().min(1).max(160),
  typeLabel: z.string().max(120).optional(),
  summary: z.string().max(2000).optional(),
});
export type PlaceTranslationInput = z.infer<typeof placeTranslationInput>;

export const placeTranslationsInput = z.object({
  en: placeTranslationInput,
  fr: placeTranslationInput.optional(),
  ar: placeTranslationInput.optional(),
});

export const contentTranslationInput = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().max(2000).optional(),
  body: z.string().max(100_000).optional(),
});
export type ContentTranslationInput = z.infer<typeof contentTranslationInput>;

export const contentTranslationsInput = z.object({
  en: contentTranslationInput,
  fr: contentTranslationInput.optional(),
  ar: contentTranslationInput.optional(),
});

/** Flatten `{en, fr?, ar?}` into locale entries for nested creates/upserts. */
export function localeEntries<T>(translations: {
  en: T;
  fr?: T | undefined;
  ar?: T | undefined;
}): Array<{ locale: 'en' | 'fr' | 'ar'; value: T }> {
  const out: Array<{ locale: 'en' | 'fr' | 'ar'; value: T }> = [
    { locale: 'en', value: translations.en },
  ];
  if (translations.fr !== undefined) out.push({ locale: 'fr', value: translations.fr });
  if (translations.ar !== undefined) out.push({ locale: 'ar', value: translations.ar });
  return out;
}

/** True when a caught error looks like a Prisma FK constraint failure (P2003). */
export function isForeignKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2003'
  );
}
