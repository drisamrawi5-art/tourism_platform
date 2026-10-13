import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary } from "@/i18n";
import { isLocale } from "@/i18n/config";
import { buildMetadata } from "@/lib/seo";
import { getGuides } from "@/lib/data/businesses";
import { EmptyState } from "@/components/ui/alert";
import { Container, PageHero, Section } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { languageLabel } from "@/components/discovery/bits";
import { FilterBar } from "@/components/discovery/filter-bar";
import { GuideCard } from "@/components/discovery/guide-card";
import {
  queryHref,
  readInt,
  readString,
  type SearchParams,
} from "@/components/discovery/query";

/**
 * Guides — published guides with a language filter. The language options
 * are the union of the languages the guides actually declare (no invented
 * list), and pagination comes from the data layer.
 */

const PER_PAGE = 12;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);

  return buildMetadata({
    locale,
    path: "/guides",
    title: dict.guides.title,
    description: dict.guides.subtitle,
  });
}

export default async function GuidesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const sp = await searchParams;

  const page = readInt(sp.page, 1) ?? 1;
  const language = readString(sp.language, 20);

  const [allGuides, result] = await Promise.all([
    getGuides(locale, { page: 1, perPage: 100 }),
    getGuides(locale, {
      page,
      perPage: PER_PAGE,
      ...(language ? { language } : {}),
    }),
  ]);

  const languageCodes = [
    ...new Set(allGuides.items.flatMap((guide) => guide.languages)),
  ].sort();

  const totalPages = Math.ceil(result.total / result.perPage);
  const overPaged = result.total > 0 && result.page > totalPages;
  const hasFilter = language !== null;

  return (
    <>
      <PageHero
        kicker={dict.nav.guides}
        title={dict.guides.title}
        description={dict.guides.subtitle}
      />

      <Section>
        <Container>
          {languageCodes.length > 0 ? (
            <div className="mb-8">
              <FilterBar
                action={`/${locale}/guides`}
                id="guide-language"
                name="language"
                label={dict.filters.language}
                value={language}
                options={[
                  { value: "", label: dict.common.all },
                  ...languageCodes.map((code) => ({
                    value: code,
                    label: languageLabel(code, locale),
                  })),
                ]}
                submitLabel={dict.filters.apply}
                clearHref={queryHref(locale, "/guides", sp, {
                  language: undefined,
                  page: undefined,
                })}
                clearLabel={dict.common.clearFilters}
              />
            </div>
          ) : null}

          {result.items.length > 0 ? (
            <>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {result.items.map((item) => (
                  <GuideCard
                    key={item.id}
                    item={item}
                    locale={locale}
                    dict={dict}
                  />
                ))}
              </div>
              <Pagination
                page={result.page}
                labels={{
                  previous: dict.common.previous,
                  next: dict.common.next,
                  pagination: dict.common.pagination,
                }}
                totalPages={totalPages}
                className="mt-8"
                hrefFor={(target) =>
                  queryHref(locale, "/guides", sp, {
                    page: target === 1 ? undefined : target,
                  })
                }
              />
            </>
          ) : hasFilter || overPaged ? (
            <EmptyState
              title={dict.common.noResults}
              action={{
                href: queryHref(locale, "/guides", sp, {
                  language: undefined,
                  page: undefined,
                }),
                label: dict.common.clearFilters,
              }}
            />
          ) : (
            <EmptyState
              title={dict.guides.noGuides}
              description={dict.guides.noGuidesBody}
            />
          )}
        </Container>
      </Section>
    </>
  );
}
