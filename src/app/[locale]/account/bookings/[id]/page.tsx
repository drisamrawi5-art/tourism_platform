import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { buildMetadata } from "@/lib/seo";
import { BookingDetailView } from "./booking-detail-view";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const l = isLocale(locale) ? locale : "en";
  const dict = getDictionary(l);
  return buildMetadata({
    locale: l,
    path: "/account/bookings",
    title: dict.account.bookings,
    description: dict.booking.reference,
    noIndex: true,
  });
}

export default async function BookingDetailPage({ params }: Props) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();

  return <BookingDetailView locale={locale} bookingId={id} />;
}
