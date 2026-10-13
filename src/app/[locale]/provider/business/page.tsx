import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { buildMetadata } from "@/lib/seo";
import { BusinessView } from "./business-view";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const l = isLocale(locale) ? locale : "en";
  const dict = getDictionary(l);
  return buildMetadata({
    locale: l,
    path: "/provider/business",
    title: dict.provider.businessProfile,
    description: dict.provider.businessType,
    noIndex: true,
  });
}

export default async function ProviderBusinessPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return <BusinessView locale={locale} />;
}
