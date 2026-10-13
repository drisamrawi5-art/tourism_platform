import { t, type Dictionary } from "@/i18n";

/**
 * Enum → localized label helpers for the admin tables/badges.
 * Unknown values fall back to the raw code (never invented copy).
 */

function pick(dict: Dictionary, key: string, fallback: string): string {
  const value = t(dict, key);
  return value === key ? fallback : value;
}

export function statusLabel(dict: Dictionary, status: string): string {
  return pick(dict, `common.status.${status}`, status);
}

export function bookingStatusLabel(dict: Dictionary, status: string): string {
  return pick(dict, `booking.statuses.${status}`, statusLabel(dict, status));
}

export function paymentStatusLabel(dict: Dictionary, status: string): string {
  return pick(dict, `booking.paymentStatuses.${status}`, status);
}

export function moderationStatusLabel(dict: Dictionary, status: string): string {
  return pick(dict, `admin.reviewStatuses.${status}`, status);
}

export function roleLabel(dict: Dictionary, role: string): string {
  return pick(dict, `admin.roles.${role}`, role);
}

export function userStatusLabel(dict: Dictionary, status: string): string {
  return pick(dict, `admin.userStatuses.${status}`, status);
}

export function businessTypeLabel(dict: Dictionary, type: string): string {
  return pick(dict, `admin.businessTypes.${type}`, type);
}

export function contentKindLabel(dict: Dictionary, kind: string): string {
  return pick(dict, `admin.contentKinds.${kind}`, kind);
}

export function mediaKindLabel(dict: Dictionary, kind: string): string {
  return pick(dict, `admin.mediaKinds.${kind}`, kind);
}

export function verificationLabel(dict: Dictionary, status: string): string {
  return pick(dict, `common.verification.${status}`, status);
}

/** Analytics event type (snake_case) → localized label, raw type when unknown. */
const EVENT_KEYS: Record<string, string> = {
  booking_started: "admin.events.bookingStarted",
  booking_completed: "admin.events.bookingCompleted",
  payment_success: "admin.events.paymentSuccess",
  payment_failure: "admin.events.paymentFailure",
  search: "admin.events.search",
};

export function eventLabel(dict: Dictionary, type: string): string {
  const key = EVENT_KEYS[type];
  return key ? t(dict, key) : type;
}
