/**
 * Serialized shapes of the frozen /api/v1/admin API responses.
 *
 * The handlers serialise Prisma enums as plain strings, so the client mirrors
 * them as string unions (kept in sync with
 * src/app/api/v1/admin/_shared/queries.ts — the API is read-only for us).
 */

export const PUBLICATION_STATUSES = [
  "DRAFT",
  "PENDING_REVIEW",
  "APPROVED",
  "PUBLISHED",
  "REJECTED",
  "ARCHIVED",
] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const VERIFICATION_STATUSES = [
  "VERIFIED",
  "PROJECT_PROVIDED",
  "PROVIDER_PROVIDED",
  "EDITORIAL",
  "PENDING_VERIFICATION",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const ADMIN_ROLE_VALUES = [
  "SUPER_ADMIN",
  "ADMIN",
  "CONTENT_MANAGER",
  "BUSINESS_OWNER",
  "GUIDE",
  "CUSTOMER",
] as const;
export type AdminRole = (typeof ADMIN_ROLE_VALUES)[number];

export const USER_STATUSES = ["ACTIVE", "SUSPENDED", "DELETED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const BOOKING_STATUS_VALUES = [
  "PENDING",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
] as const;
export type BookingStatus = (typeof BOOKING_STATUS_VALUES)[number];

export const PAYMENT_STATUS_VALUES = [
  "UNPAID",
  "PARTIALLY_PAID",
  "PAID",
  "REFUNDED",
  "FAILED",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUS_VALUES)[number];

export const REVIEW_STATUS_VALUES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type ReviewStatus = (typeof REVIEW_STATUS_VALUES)[number];

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
export type BusinessType = (typeof BUSINESS_TYPES)[number];

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
export type ContentKind = (typeof CONTENT_KINDS)[number];

export const MEDIA_KINDS = ["IMAGE", "VIDEO"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** Person summary as selected by the admin handlers. */
export type AdminPerson = {
  id: string;
  email: string;
  name: string | null;
};

export type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: AdminRole;
  status: UserStatus;
  emailVerifiedAt: string | null;
  createdAt: string;
  businessCount: number;
};

export type BusinessListRow = {
  id: string;
  name: string;
  slug: string;
  type: BusinessType;
  status: PublicationStatus;
  verificationStatus: VerificationStatus;
  featured: boolean;
  submittedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
  owner: AdminPerson;
  bookableCount: number;
  bookingCount: number;
};

export type BusinessTranslation = {
  locale: string;
  name: string;
  description: string | null;
};

export type BusinessDetail = {
  id: string;
  ownerId: string;
  type: BusinessType;
  slug: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  verificationStatus: VerificationStatus;
  status: PublicationStatus;
  submittedAt: string | null;
  approvedAt: string | null;
  noIndex: boolean;
  featured: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  owner: AdminPerson;
  translations: BusinessTranslation[];
  _count: { bookables: number; bookings: number; reviews: number };
};

export type PlaceTranslation = {
  id: string;
  locale: string;
  name: string;
  typeLabel: string | null;
  summary: string | null;
};

export type PlaceRow = {
  id: string;
  destinationId: string;
  slug: string;
  typeLabel: string | null;
  status: PublicationStatus;
  verificationStatus: VerificationStatus;
  lat: number | null;
  lng: number | null;
  noIndex: boolean;
  featured: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  translations: PlaceTranslation[];
};

export type ContentTranslation = {
  id: string;
  locale: string;
  title: string;
  summary: string | null;
  body: string | null;
};

export type ContentRow = {
  id: string;
  kind: ContentKind;
  slug: string;
  status: PublicationStatus;
  verificationStatus: VerificationStatus;
  authorId: string | null;
  noIndex: boolean;
  featured: boolean;
  sortOrder: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  translations: ContentTranslation[];
  author: { id: string; name: string | null; email: string } | null;
};

export type MediaRow = {
  id: string;
  kind: MediaKind;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  alt: string;
  caption: string | null;
  status: PublicationStatus;
  verificationStatus: VerificationStatus;
  createdAt: string;
  uploadedBy: { id: string; name: string | null; email: string } | null;
  target: {
    placeId: string | null;
    businessId: string | null;
    contentId: string | null;
    albumId: string | null;
  };
};

export type CommentRow = {
  id: string;
  mediaId: string;
  authorId: string;
  parentId: string | null;
  body: string;
  status: ReviewStatus;
  createdAt: string;
  updatedAt: string;
  media: { id: string; storageKey: string; alt: string };
  author: { name: string | null };
};

export type ReviewRow = {
  id: string;
  rating: number;
  comment: string | null;
  status: ReviewStatus;
  moderatedAt: string | null;
  createdAt: string;
  customer: { id: string; name: string | null; email: string };
  booking: { id: string; reference: string };
  bookable: { id: string; slug: string; category: string };
  business: { id: string; name: string; slug: string };
};

export type BookingRow = {
  id: string;
  reference: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  paymentMode: string;
  startDate: string;
  endDate: string;
  guests: number;
  currency: string;
  subtotal: string;
  discount: string;
  total: string;
  depositAmount: string | null;
  amountPaid: string;
  amountRefunded: string;
  customerName: string;
  customerEmail: string;
  createdAt: string;
  confirmedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  business: { id: string; name: string; slug: string } | null;
  customer: { id: string; name: string | null } | null;
};

export type PaymentRow = {
  id: string;
  bookingId: string;
  provider: string;
  mode: string;
  status: PaymentStatus | string;
  amount: string;
  currency: string;
  failureReason: string | null;
  paidAt: string | null;
  failedAt: string | null;
  createdAt: string;
  booking: { id: string; reference: string } | null;
};

export type AuditRow = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  actor: AdminPerson | null;
};

export type OverviewData = {
  totalUsers: number;
  businessesByStatus: { status: PublicationStatus; count: number }[];
  bookingsLast30DaysByStatus: { status: BookingStatus; count: number }[];
  revenueLast30Days: { amount: string; currency: string };
  pendingReviews: number;
  contentPendingReview: number;
  analyticsLast30Days: {
    bookingCompleted: number;
    paymentSuccess: number;
    search: number;
  };
};

export type AnalyticsData = {
  days: number;
  eventsByType: { type: string; count: number }[];
  topPaths: { path: string; count: number }[];
  dailyCounts: { date: string; count: number }[];
  funnel: {
    booking_started: number;
    booking_completed: number;
    payment_success: number;
    payment_failure: number;
  };
};

export type FlagRow = { key: string; enabled: boolean };

export type SettingsData = Record<string, unknown>;

export type RefundResult = {
  refundId: string;
  status: string;
  message?: string;
};
