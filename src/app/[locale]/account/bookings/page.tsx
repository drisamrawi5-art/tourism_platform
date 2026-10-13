import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { buildMetadata } from "@/lib/seo";
import { BookingsListView } from "./bookings-list-view";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const BOOKING_STATUSES = ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "REFUNDED"] as const;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const l = isLocale(locale) ? locale : "en";
  const dict = getDictionary(l);
  return buildMetadata({
    locale: l,
    path: "/account/bookings",
    title: dict.booking.myBookings,
    description: dict.booking.noBookingsBody,
    noIndex: true,
  });
}

export default async function AccountBookingsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const query = await searchParams;
  const pageRaw = Number.parseInt(first(query.page) ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const statusRaw = first(query.status) ?? "";
  const status = (BOOKING_STATUSES as readonly string[]).includes(statusRaw)
    ? (statusRaw as (typeof BOOKING_STATUSES)[number])
    : "";

  return <BookingsListView locale={locale} initialPage={page} initialStatus={status} />;
}
