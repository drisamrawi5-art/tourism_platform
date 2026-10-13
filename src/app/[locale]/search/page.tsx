import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { buildMetadata } from "@/lib/seo";
import { Container, PageHero, Section } from "@/components/ui/card";
import { LoadingBlock } from "@/components/ui/button";
import { SearchPanel } from "@/components/editorial/search-panel";

/**
 * Search page — server shell (locale guard + metadata) around the client
 * SearchPanel. The panel reads the initial ?q= with useSearchParams; it is
 * wrapped in Suspense so the hook always has a boundary above it.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const l = isLocale(locale) ? locale : "en";
  const dict = getDictionary(l);
  return buildMetadata({
    locale: l,
    path: "/search",
    title: dict.search.title,
    description: dict.search.placeholder,
  });
}

export default async function SearchPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<ReactNode> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const dict = getDictionary(locale);

  return (
    <>
      <PageHero kicker={dict.brand.tagline} title={dict.search.title} />
      <Section>
        <Container>
          <Suspense fallback={<LoadingBlock text={dict.common.loading} />}>
            <SearchPanel locale={locale} dict={dict} />
          </Suspense>
        </Container>
      </Section>
    </>
  );
}
