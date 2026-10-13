import type { Booking, BookingItem, Payment, Business } from '@prisma/client';

/** Minimal shape of a bookable as included by booking queries (for naming). */
export type BookableNameShape = {
  slug: string;
  category: string;
  unit?: { name: string } | null;
  guideService?: { name: string } | null;
};

/**
 * Booking serialization (spec sections 29, 84, 90).
 *
 * The raw Booking row contains platform-internal money data (commission
 * rate/amount) and must never be returned verbatim to a customer.
 * - `toPublicBooking` — customer-facing view (commission never included)
 * - `toProviderBooking` — provider/admin view (adds commission + customer contact)
 */

export type PublicBookingItem = {
  bookableId: string;
  name: string | null;
  category: string | null;
  startDate: string;
  endDate: string;
  guests: number;
  quantity: number;
  pricingUnit: string;
  unitPrice: string;
  subtotal: string;
};

export type PublicPayment = {
  id: string;
  status: string;
  mode: string;
  amount: string;
  currency: string;
  createdAt: string;
};

function dateOnly(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function itemToPublic(
  item: BookingItem & { bookable?: BookableNameShape | null },
): PublicBookingItem {
  const name = item.bookable?.unit?.name ?? item.bookable?.guideService?.name ?? null;
  return {
    bookableId: item.bookableId,
    name: name ?? item.bookable?.slug ?? null,
    category: item.bookable?.category ?? null,
    startDate: dateOnly(item.startDate),
    endDate: dateOnly(item.endDate),
    guests: item.guests,
    quantity: item.quantity,
    pricingUnit: item.pricingUnit,
    unitPrice: item.unitPrice.toString(),
    subtotal: item.subtotal.toString(),
  };
}

function paymentToPublic(p: Payment): PublicPayment {
  return {
    id: p.id,
    status: p.status,
    mode: p.mode,
    amount: p.amount.toString(),
    currency: p.currency,
    createdAt: p.createdAt.toISOString(),
  };
}

export type BookingRelations = {
  items?: (BookingItem & { bookable?: BookableNameShape | null })[];
  business?: Pick<Business, 'id' | 'name' | 'slug' | 'ownerId' | 'type'> | null;
  payments?: Payment[];
};

export type PublicBooking = {
  id: string;
  reference: string;
  status: string;
  paymentStatus: string;
  paymentMode: string;
  startDate: string;
  endDate: string;
  guests: number;
  currency: string;
  subtotal: string;
  discount: string;
  total: string;
  depositEnabled: boolean;
  depositAmount: string | null;
  amountPaid: string;
  amountRefunded: string;
  cancellationPolicyText: string | null;
  holdExpiresAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  business: { id: string; name: string; slug: string } | null;
  customer: {
    name: string | null;
    email: string | null;
    phone: string | null;
    note: string | null;
  };
  items: PublicBookingItem[];
  payments: PublicPayment[];
};

export function toPublicBooking(booking: Booking & BookingRelations): PublicBooking {
  return {
    id: booking.id,
    reference: booking.reference,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    paymentMode: booking.paymentMode,
    startDate: dateOnly(booking.startDate),
    endDate: dateOnly(booking.endDate),
    guests: booking.guests,
    currency: booking.currency,
    subtotal: booking.subtotal.toString(),
    discount: booking.discount.toString(),
    total: booking.total.toString(),
    depositEnabled: booking.depositEnabled,
    depositAmount: booking.depositAmount ? booking.depositAmount.toString() : null,
    amountPaid: booking.amountPaid.toString(),
    amountRefunded: booking.amountRefunded.toString(),
    cancellationPolicyText: booking.cancellationPolicyText,
    holdExpiresAt: booking.holdExpiresAt ? booking.holdExpiresAt.toISOString() : null,
    cancelledAt: booking.cancelledAt ? booking.cancelledAt.toISOString() : null,
    cancelReason: booking.cancelReason,
    createdAt: booking.createdAt.toISOString(),
    business: booking.business
      ? { id: booking.business.id, name: booking.business.name, slug: booking.business.slug }
      : null,
    customer: {
      name: booking.customerName,
      email: booking.customerEmail,
      phone: booking.customerPhone,
      note: booking.customerNote,
    },
    items: (booking.items ?? []).map(itemToPublic),
    payments: (booking.payments ?? []).map(paymentToPublic),
  };
}

export type ProviderBooking = PublicBooking & {
  commissionRate: string;
  commissionAmount: string;
  customerEmail: string | null;
};

export function toProviderBooking(booking: Booking & BookingRelations): ProviderBooking {
  return {
    ...toPublicBooking(booking),
    commissionRate: booking.commissionRate.toString(),
    commissionAmount: booking.commissionAmount.toString(),
    customerEmail: booking.customerEmail,
  };
}
