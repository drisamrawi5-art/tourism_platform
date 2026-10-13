import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { buildMetadata } from "@/lib/seo";
import { getJournal } from "@/lib/data/content";
import { EmptyState } from "@/components/ui/alert";
import { Pagination } from "@/components/ui/pagination";
import { Container, PageHero, Section } from "@/components/ui/card";
import { JournalCard } from "@/components/editorial/journal-card";

/**
 * Journal index — published editorial content (STORY / EDITORIAL /
 * TRAVEL_GUIDE), newest first. Cards link to /{locale}/journal/{slug}.
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
    path: "/journal",
    title: dict.journal.title,
    description: dict.journal.subtitle,
  });
}

export default async function JournalPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}): Promise<ReactNode> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const l = locale;
  const dict = getDictionary(l);

  const { page: pageParam } = await searchParams;
  const rawPage =
    typeof pageParam === "string" && pageParam.trim() !== "" ? Number(pageParam) : Number.NaN;

  const { items, total, page, perPage } = await getJournal(l, { page: rawPage, perPage: 9 });
  const totalPages = Math.ceil(total / perPage);

  return (
    <>
      <PageHero kicker={dict.brand.tagline} title={dict.journal.title} description={dict.journal.subtitle} />

      <Section>
        <Container>
          {items.length === 0 ? (
            <EmptyState
              title={dict.journal.empty}
              description={dict.common.empty}
              action={{ href: `/${l}/places`, label: dict.nav.places }}
            />
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <JournalCard
                  key={item.id}
                  item={item}
                  locale={l}
                  href={`/${l}/journal/${item.slug}`}
                  priority={item.featured}
                />
              ))}
            </div>
          )}

          <Pagination
            page={page}
            labels={{
              previous: dict.common.previous,
              next: dict.common.next,
              pagination: dict.common.pagination,
            }}
            totalPages={totalPages}
            hrefFor={(p) => `/${l}/journal?page=${p}`}
            className="mt-8"
          />
        </Container>
      </Section>
    </>
  );
}
