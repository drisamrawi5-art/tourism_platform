import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { LegalShell, legalMetadata } from "@/components/editorial/legal-shell";

/** Provider Terms — document pending publication by the operators. */

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  const l = isLocale(locale) ? locale : "en";
  return legalMetadata({
    locale: l,
    path: "/legal/provider-terms",
    title: getDictionary(l).footer.providerTerms,
  });
}

export default async function ProviderTermsPage({
  params,
}: {
  params: Params;
}): Promise<ReactNode> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <LegalShell locale={locale} title={getDictionary(locale).footer.providerTerms} />;
}
