/**
 * Response shapes of the frozen /api/v1/provider/* endpoints.
 *
 * These are JSON-serialized Prisma rows: Date fields arrive as ISO strings and
 * Decimal fields as strings. Only the fields the portal actually renders are
 * declared — the API handlers are the contract, these types mirror them.
 */

export type PublicationStatus =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "PUBLISHED"
  | "REJECTED"
  | "ARCHIVED";

export type BookingStatusValue =
  | "PENDING"
  | "CONFIRMED"
  | "COMPLETED"
  | "CANCELLED"
  | "REFUNDED";

export type BookableCategory = "ACCOMMODATION" | "GUIDE";
export type PricingUnitValue = "NIGHT" | "PERSON" | "DAY" | "SERVICE";
export type CreateableBusinessType = "ACCOMMODATION" | "GUIDE";

/** Provider-level booking configuration overrides (business.config JSON). */
export type ProviderBusinessConfig = {
  depositEnabled?: boolean;
  depositPercent?: number;
  freeCancellationHours?: number;
  cancellationPolicyText?: string;
};

/** Scalar columns of a business (present on GET/PATCH/POST/submit responses). */
export type ProviderBusinessScalars = {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: PublicationStatus;
  email: string | null;
  phone: string | null;
  address: string | null;
  config: ProviderBusinessConfig | null;
  submittedAt: string | null;
  approvedAt: string | null;
};

/** GET /api/v1/provider/business → { data: { business } } (includes below). */
export type ProviderBusiness = ProviderBusinessScalars & {
  translations?: Array<{
    id: string;
    locale: string;
    name: string;
    description: string | null;
  }>;
  bookables?: Array<{
    id: string;
    slug: string;
    category: BookableCategory;
    status: PublicationStatus;
  }>;
};

/** GET /api/v1/provider/overview → { data: { overview } }. */
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
  upcomingBookings: Array<{
    id: string;
    reference: string;
    startDate: string;
    endDate: string;
    status: string;
    paymentStatus: string;
  }>;
  pendingReviews: number;
};

/** Scalar columns of a booking (GET detail returns these plus relations). */
export type ProviderBookingScalars = {
  id: string;
  reference: string;
  status: BookingStatusValue;
  paymentStatus: string;
  paymentMode: string;
  startDate: string;
  endDate: string;
  guests: number;
  currency: string;
  subtotal: string;
  discount: string;
  total: string;
  amountPaid: string;
  amountRefunded: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerNote: string | null;
  cancellationPolicyText: string | null;
  confirmedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
};

export type ProviderBookingItem = {
  bookableId: string;
  startDate: string;
  endDate: string;
  guests: number;
  quantity: number;
  pricingUnit: string;
  unitPrice: string;
  subtotal: string;
  bookable: {
    slug: string;
    category: string;
    unit: { name: string } | null;
    guideService: { name: string } | null;
  } | null;
};

export type ProviderBookingCustomer = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
} | null;

/** GET /api/v1/provider/bookings (paginated rows — no payments/reviews). */
export type ProviderBookingListRow = ProviderBookingScalars & {
  customer: ProviderBookingCustomer;
  business: { id: string; name: string } | null;
  items: ProviderBookingItem[];
};

export type ProviderPayment = {
  id: string;
  status: string;
  amount: string;
  currency: string;
  mode: string;
  createdAt: string;
};

export type ProviderReview = {
  id: string;
  rating: number;
  comment: string | null;
  status: string;
  createdAt: string;
  customer?: { name: string | null } | null;
  bookable?: {
    slug: string;
    unit: { name: string } | null;
    guideService: { name: string } | null;
  } | null;
};

/** GET /api/v1/provider/bookings/[id] → { data: { booking } }. */
export type ProviderBookingDetail = ProviderBookingScalars & {
  customer: ProviderBookingCustomer;
  business: { id: string; name: string } | null;
  items: ProviderBookingItem[];
  payments: ProviderPayment[];
  reviews: ProviderReview[];
};

export type ProviderPrice = {
  id: string;
  unit: PricingUnitValue;
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
  state: string;
  capacityOverride: number | null;
  reason: string | null;
};

/** GET /api/v1/provider/bookables (paginated rows). */
export type ProviderBookable = {
  id: string;
  category: BookableCategory;
  slug: string;
  capacity: number;
  status: PublicationStatus;
  unit?: { id: string; name: string; description: string | null; capacity: number | null } | null;
  guideService?: { id: string; name: string; description: string | null } | null;
  prices?: ProviderPrice[];
  availabilityRules?: ProviderRule[];
  availabilityBlocks?: ProviderBlock[];
  business?: { id: string; name: string; slug: string; status: PublicationStatus };
};

/** GET /api/v1/provider/revenue → { data: … } (no currency field — MAD). */
export type ProviderRevenue = {
  bookingsTotal: number;
  byStatus: Array<{ status: string; count: number; paid: string; refunded: string }>;
  bookingsLast30: number;
  grossPaid: string;
  refunded: string;
  net: string;
};
