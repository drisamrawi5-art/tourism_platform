/**
 * Enum option lists mirrored from the admin API zod schemas
 * (src/app/api/v1/admin/_shared/queries.ts). Kept in sync by hand — the
 * routes reject anything outside these values.
 */
export const PUBLICATION_STATUSES = [
  "DRAFT",
  "PENDING_REVIEW",
  "APPROVED",
  "PUBLISHED",
  "REJECTED",
  "ARCHIVED",
] as const;

export const ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "CONTENT_MANAGER",
  "BUSINESS_OWNER",
  "GUIDE",
  "CUSTOMER",
] as const;

export const USER_STATUSES = ["ACTIVE", "SUSPENDED", "DELETED"] as const;

export const BOOKING_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
] as const;

export const PAYMENT_STATUSES = [
  "UNPAID",
  "PARTIALLY_PAID",
  "PAID",
  "REFUNDED",
  "FAILED",
] as const;

export const REVIEW_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

export const MEDIA_KINDS = ["IMAGE", "VIDEO"] as const;

export const BUSINESS_TYPES = [
  "ACCOMMODATION",
  "GUIDE",
  "RESTAURANT",
  "TRANSPORT",
  "EXPERIENCE",
  "ACTIVITY",
  "EVENT",
  "PARTNER",
] as const;

export const CONTENT_KINDS = [
  "PLACE",
  "DESTINATION",
  "STORY",
  "GUIDE",
  "ACCOMMODATION",
  "EDITORIAL",
  "EXPERIENCE",
  "EVENT",
  "RESTAURANT",
  "TRAVEL_GUIDE",
] as const;

export const VERIFICATION_STATUSES = [
  "VERIFIED",
  "PROJECT_PROVIDED",
  "PROVIDER_PROVIDED",
  "EDITORIAL",
  "PENDING_VERIFICATION",
] as const;
