import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { buildMetadata } from "@/lib/seo";
import { AvailabilityView } from "./availability-view";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const l = isLocale(locale) ? locale : "en";
  const dict = getDictionary(l);
  return buildMetadata({
    locale: l,
    path: "/provider/availability",
    title: dict.provider.availability,
    description: dict.filters.availability,
    noIndex: true,
  });
}

export default async function ProviderAvailabilityPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const query = await searchParams;
  const raw = first(query.bookable);
  const initialBookable = raw && raw.length > 0 ? raw.slice(0, 64) : null;

  return <AvailabilityView locale={locale} initialBookable={initialBookable} />;
}
