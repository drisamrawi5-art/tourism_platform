import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { adminMetadata } from "../../_meta";
import { BusinessDetailView } from "./business-detail-view";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const l = isLocale(locale) ? locale : "en";
  return adminMetadata(l, getDictionary(l).admin.businesses);
}

export default async function AdminBusinessDetailPage({ params }: Props) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();

  return <BusinessDetailView locale={locale} businessId={id} />;
}
