import { ApiClientError } from "@/lib/api/client";
import { formError } from "@/components/auth/helpers";
import { t, type Dictionary } from "@/i18n";
import { intlLocale, type Locale } from "@/i18n/config";

/**
 * Shared helpers for the provider portal.
 *
 * Response shapes below mirror the route contracts in
 * `src/app/api/v1/provider/**` (everything is wrapped in `{ data: … }` or
 * `{ error: { code, message } }`). When a route's real payload differs from
 * the UI brief, the route wins — these types are the contract.
 */

export type PublicationStatus =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "PUBLISHED"
  | "REJECTED"
  | "ARCHIVED";

export type BookingStatus = "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "REFUNDED";
export type PaymentStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID" | "REFUNDED" | "FAILED";
export type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";
export type PricingUnit = "NIGHT" | "PERSON" | "DAY" | "SERVICE";
export type AvailabilityState = "AVAILABLE" | "UNAVAILABLE" | "BLOCKED" | "BOOKED";
export type BookableCategory = "ACCOMMODATION" | "GUIDE";

/* ---------------------------------------------------------------------------
 * GET /api/v1/provider/overview
 * ------------------------------------------------------------------------- */

export type ProviderOverview = {
  businesses: Record<string, number>;
  bookingsByStatus: Record<string, number>;
  bookingsTotal: number;
  revenue: {
    grossCollected: string;
    refunded: string;
    commission: string;
    net: string;
    currency: string;
  };
  upcomingBookings: {
    id: string;
    reference: string;
    startDate: string;
    endDate: string;
    status: string;
    paymentStatus: string;
  }[];
  pendingReviews: number;
};

/* ---------------------------------------------------------------------------
 * GET|POST /api/v1/provider/business · PATCH /api/v1/provider/business/[id]
 * ------------------------------------------------------------------------- */

export type ProviderBusiness = {
  id: string;
  name: string;
  slug: string;
  type: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: PublicationStatus;
  submittedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
  translations: { locale: string; name: string; description: string | null }[];
  bookables: { id: string; slug: string; category: string; status: string }[];
};

/* ---------------------------------------------------------------------------
 * Bookables, prices, availability rules and blocks
 * ------------------------------------------------------------------------- */

export type ProviderPrice = {
  id: string;
  unit: PricingUnit;
  amount: string;
  currency: string;
  validFrom: string | null;
  validTo: string | null;
  priority: number;
  active: boolean;
};

export type ProviderRule = {
  id: string;
  startDate: string;
  endDate: string | null;
  weekday: number | null;
  capacity: number;
};

export type ProviderBlock = {
  id: string;
  startDate: string;
  endDate: string;
  state: AvailabilityState;
  capacityOverride: number | null;
  reason: string | null;
};

export type ProviderBookable = {
  id: string;
  category: BookableCategory;
  businessId: string;
  slug: string;
  capacity: number;
  status: PublicationStatus;
  createdAt: string;
  unit?: { name: string; description: string | null } | null;
  guideService?: { name: string; description: string | null } | null;
  prices?: ProviderPrice[] | null;
  availabilityRules?: ProviderRule[] | null;
  availabilityBlocks?: ProviderBlock[] | null;
  business?: { id: string; name: string; slug: string; status: PublicationStatus } | null;
};

/** Display name of a bookable (unit name for stays, service name for guides). */
export function bookableTitle(bookable: ProviderBookable): string {
  return bookable.unit?.name ?? bookable.guideService?.name ?? bookable.slug;
}

/* ---------------------------------------------------------------------------
 * Provider bookings (list + detail)
 * ------------------------------------------------------------------------- */

export type ProviderBookingItem = {
  id: string;
  bookableId: string;
  startDate: string;
  endDate: string;
  guests: number;
  quantity: number;
  pricingUnit: PricingUnit;
  unitPrice: string;
  subtotal: string;
  bookable: {
    slug: string;
    category: BookableCategory;
    unit?: { name: string } | null;
    guideService?: { name: string } | null;
  };
};

export type ProviderBookingListItem = {
  id: string;
  reference: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  paymentMode: "FULL" | "DEPOSIT";
  startDate: string;
  endDate: string;
  guests: number;
  currency: string;
  subtotal: string;
  discount: string;
  commissionRate: string;
  commissionAmount: string;
  total: string;
  amountPaid: string;
  amountRefunded: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerNote: string | null;
  createdAt: string;
  customer: { id?: string; name: string | null; email: string | null; phone: string | null } | null;
  business?: { id: string; name: string } | null;
  items: ProviderBookingItem[];
};

export type ProviderBookingDetail = ProviderBookingListItem & {
  depositEnabled: boolean;
  depositAmount: string | null;
  cancellationPolicyText: string | null;
  confirmedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  payments: {
    id: string;
    status: PaymentStatus;
    amount: string;
    currency: string;
    mode: "FULL" | "DEPOSIT";
    createdAt: string;
  }[];
};

/* ---------------------------------------------------------------------------
 * GET /api/v1/provider/revenue · GET /api/v1/provider/reviews
 * ------------------------------------------------------------------------- */

export type ProviderRevenue = {
  bookingsTotal: number;
  byStatus: { status: string; count: number; paid: string; refunded: string }[];
  bookingsLast30: number;
  grossPaid: string;
  refunded: string;
  net: string;
};

export type ProviderReview = {
  id: string;
  rating: number;
  comment: string | null;
  status: ReviewStatus;
  bookingId: string;
  createdAt: string;
  customer: { name: string | null } | null;
  bookable: {
    slug: string;
    unit?: { name: string } | null;
    guideService?: { name: string } | null;
  } | null;
};

/* ---------------------------------------------------------------------------
 * Media (GET /api/v1/media · POST /api/v1/media/upload)
 * ------------------------------------------------------------------------- */

export type BusinessMedia = {
  id: string;
  url: string;
  alt: string;
  caption: string | null;
  width: number | null;
  height: number | null;
  kind: string;
  createdAt: string;
};

/** Media row right after upload (GET /api/v1/media hides PENDING_REVIEW rows). */
export type PendingMedia = {
  id: string;
  storageKey: string;
  alt: string;
  status: string;
};

/**
 * Multipart upload against POST /api/v1/media/upload.
 * Field names per the route: `file` + `alt` + exactly one subject
 * (`businessId` for the provider portal).
 */
export async function uploadBusinessMedia(input: {
  file: File;
  alt: string;
  businessId: string;
}): Promise<PendingMedia> {
  const form = new FormData();
  form.append("file", input.file);
  form.append("alt", input.alt);
  form.append("businessId", input.businessId);

  let response: Response;
  try {
    response = await fetch("/api/v1/media/upload", {
      method: "POST",
      credentials: "same-origin",
      body: form,
    });
  } catch {
    throw new ApiClientError(0, "NETWORK_ERROR", "Network error");
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const err = (payload as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiClientError(
      response.status,
      err?.code ?? "UNKNOWN_ERROR",
      err?.message ?? `Upload failed (${response.status})`,
    );
  }

  const media = (payload as { data?: { media?: PendingMedia } } | null)?.data?.media;
  if (!media) throw new ApiClientError(response.status, "UNKNOWN_ERROR", "Upload failed");
  return media;
}

/* ---------------------------------------------------------------------------
 * Localized copy helpers
 * ------------------------------------------------------------------------- */

/** API error code → provider dictionary key (unknown codes fall through). */
const ERROR_CODE_KEYS: Record<string, string> = {
  INVALID_STATUS: "invalidStatus",
  BUSINESS_NOT_APPROVED: "businessNotApproved",
  HAS_BOOKINGS: "hasBookings",
  NOT_PENDING: "notPending",
  NOT_COMPLETABLE: "notCompletable",
  CATEGORY_MISMATCH: "categoryMismatch",
  INVALID_DATE_RANGE: "invalidInput",
  INVALID_RANGE: "invalidInput",
  DUPLICATE_BASE_PRICE: "invalidInput",
  TOO_LARGE: "fileTooLarge",
  UNSUPPORTED_TYPE: "fileUnsupported",
  TYPE_MISMATCH: "fileUnsupported",
  ONE_BUSINESS: "oneBusiness",
};

/** Map an API error code to localized provider copy; falls back to formError. */
export function providerErrorMessage(
  error: unknown,
  dict: Dictionary,
  vars?: Record<string, string | number>,
): string {
  if (error instanceof ApiClientError) {
    const codeKey = ERROR_CODE_KEYS[error.code];
    if (codeKey) {
      const key = `provider.errors.${codeKey}`;
      const message = t(dict, key, vars);
      if (message !== key) return message;
    }
  }
  return formError(error, dict);
}

/**
 * Localized label for a category/status enum value. Unknown values fall back
 * to the raw value (never an untranslated dictionary key).
 */
export function enumLabel(dict: Dictionary, prefix: string, value: string): string {
  const key = `${prefix}.${value}`;
  const label = t(dict, key);
  return label === key ? value : label;
}

export function categoryLabel(dict: Dictionary, category: string): string {
  return enumLabel(dict, "provider.categories", category);
}

/** Short localized weekday name for an AvailabilityRule.weekday (0 = Sunday). */
export function weekdayName(weekday: number, locale: Locale): string {
  const day = Math.min(6, Math.max(0, Math.trunc(weekday)));
  // 2024-01-07 was a Sunday, so UTC+day yields the matching weekday.
  const date = new Date(Date.UTC(2024, 0, 7 + day));
  try {
    return new Intl.DateTimeFormat(intlLocale(locale), {
      weekday: "long",
      timeZone: "UTC",
    }).format(date);
  } catch {
    return String(weekday);
  }
}

/** Format a byte count as megabytes for the upload-limit caption ("10 MB"). */
export function formatMegabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  const value = Number.isInteger(mb) ? String(mb) : mb.toFixed(1);
  return `${value} MB`;
}
