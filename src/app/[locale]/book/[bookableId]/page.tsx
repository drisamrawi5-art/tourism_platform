import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { buildMetadata } from "@/lib/seo";
import { BookingWizard } from "./booking-wizard";

type Props = { params: Promise<{ locale: string; bookableId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const l = isLocale(locale) ? locale : "en";
  const dict = getDictionary(l);
  return buildMetadata({
    locale: l,
    path: "/book",
    title: dict.booking.title,
    description: dict.plan.bookingInfoBody,
    noIndex: true,
  });
}

export default async function BookPage({ params }: Props) {
  const { locale, bookableId } = await params;
  if (!isLocale(locale)) notFound();

  return <BookingWizard locale={locale} bookableId={bookableId} />;
}
